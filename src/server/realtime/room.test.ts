import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { type Dictionary, loadDictionary } from "../../game/dictionary";
import { Dictionary as SmallDictionary } from "../../game/dictionary/dictionary";
import { findWords } from "../../game/finder";
import { Rng } from "../../game/rng";
import { boardFromRows, classicWith, down } from "../../game/test-utils";
import type { GameState, WordList } from "../../game/types";
import {
	COUNTDOWN_MS,
	type MatchMode,
	RECONNECT_GRACE_MS,
	ROUND_BREAK_MS,
	type ServerMessage,
} from "../../shared/protocol";
import { startBot } from "../bot/bot";
import { type Connection, Room, type RoomDeps } from "./room";

class FakeConnection implements Connection {
	readonly messages: ServerMessage[] = [];
	send(message: ServerMessage) {
		this.messages.push(message);
	}
	last<T extends ServerMessage["type"]>(type: T) {
		return this.messages.findLast(
			(m): m is Extract<ServerMessage, { type: T }> => m.type === type,
		);
	}
	get room() {
		const room = this.last("room")?.room;
		if (!room) throw new Error("no room message yet");
		return room;
	}
	get board() {
		const board = this.last("board");
		if (!board) throw new Error("no board message yet");
		return board;
	}
}

let dictionary: Dictionary;
beforeAll(async () => {
	dictionary = await loadDictionary();
});

let ids = 0;
let onClose = vi.fn<(room: Room) => void>();
function makeRoom(
	overrides: Partial<RoomDeps> = {},
	words: WordList = dictionary,
	mode: MatchMode = "duel",
) {
	onClose = vi.fn<(room: Room) => void>();
	const random = Rng.fromSeed("bots");
	return new Room("ABCDE", mode, mode === "duel" ? 180 : 60, {
		words,
		randomId: () => `id-${++ids}`,
		onSeatGone: () => {},
		onClose,
		startBot: (room, seatId, difficulty) =>
			startBot(room, seatId, difficulty, words, () => random.next()),
		...overrides,
	});
}

/** Two players seated, match started and past the countdown. */
function duel(overrides: Partial<RoomDeps> = {}, words?: WordList) {
	const room = makeRoom(overrides, words);
	const ann = new FakeConnection();
	const bob = new FakeConnection();
	room.join("guest-ann", "Ann", ann);
	room.join("guest-bob", "Bob", bob);
	expect(room.start("guest-ann")).toBeNull();
	vi.advanceTimersByTime(COUNTDOWN_MS);
	return { room, ann, bob };
}

/** Each seat gets "cat" down column 0; optionally a curse one row above the bottom. */
const catGame = (withCurse: boolean) => (seed: string) => {
	const rows = ["c", "a", "t", "e", "e", "e", "e", "e"].map(
		(l) => `${l} e e e e e e`,
	);
	if (withCurse) rows[6] = "e e e e !e e e";
	return classicWith(boardFromRows(rows), { seed });
};
const smallWords = new SmallDictionary(["cat"]);

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
});
afterEach(() => {
	vi.useRealTimers();
});

describe("lobby", () => {
	it("seats two players, makes the first one host, and refuses a third", () => {
		const room = makeRoom();
		const ann = new FakeConnection();
		expect(room.join("guest-ann", "Ann", ann)).toBeNull();
		expect(room.join("guest-bob", "Bob", new FakeConnection())).toBeNull();
		expect(room.join("guest-cat", "Cat", new FakeConnection())).toBe(
			"room-full",
		);
		expect(ann.room.seats.map((s) => [s.name, s.host])).toEqual([
			["Ann", true],
			["Bob", false],
		]);
	});

	it("only lets the host start, and only with two players", () => {
		const room = makeRoom();
		room.join("guest-ann", "Ann", new FakeConnection());
		expect(room.start("guest-ann")).toBe("need-two-players");
		room.join("guest-bob", "Bob", new FakeConnection());
		expect(room.start("guest-bob")).toBe("not-host");
		expect(room.start("guest-ann")).toBeNull();
		expect(room.phase).toBe("countdown");
		expect(room.join("guest-cat", "Cat", new FakeConnection())).toBe(
			"match-running",
		);
	});

	it("hands the host role on, and closes when the last person leaves", () => {
		const room = makeRoom();
		const bob = new FakeConnection();
		room.join("guest-ann", "Ann", new FakeConnection());
		room.join("guest-bob", "Bob", bob);
		room.leave("guest-ann");
		expect(bob.room.seats).toEqual([
			expect.objectContaining({ name: "Bob", host: true }),
		]);
		room.leave("guest-bob");
		expect(onClose).toHaveBeenCalled();
		expect(bob.last("left")).toBeDefined();
	});

	it("closes a lobby nobody starts after ten minutes", () => {
		makeRoom().join("guest-ann", "Ann", new FakeConnection());
		vi.advanceTimersByTime(10 * 60_000);
		expect(onClose).toHaveBeenCalled();
	});
});

describe("the match", () => {
	it("counts down, then deals each player their own board", () => {
		const { room, ann, bob } = duel();
		expect(room.phase).toBe("playing");
		expect(ann.board.state.status).toBe("playing");
		expect(ann.board.state).not.toHaveProperty("seed");
		expect(ann.board.state).not.toHaveProperty("rng");
		expect(ann.board.state.board).not.toEqual(bob.board.state.board);
		expect(ann.room.phaseEndsAt).toBe(Date.now() + 180_000);
		expect(ann.last("opponent")?.mini.split(",")).toHaveLength(56);
	});

	it("scores a valid word and shows it to the opponent", () => {
		const { room, ann, bob } = duel();
		const [word] = findWords(ann.board.state.board, dictionary);
		room.move("guest-ann", 1, { type: "play", path: word.path });
		expect(ann.board).toMatchObject({ seq: 1, ok: true, error: null });
		expect(ann.board.state.score).toBe(word.score);
		expect(bob.room.seats[0].score).toBe(word.score);
		expect(bob.last("opponent")?.mini).toBeDefined();
	});

	it("rejects tampered paths without changing the board", () => {
		const { room, ann } = duel();
		const before = ann.board.state;
		room.move("guest-ann", 7, { type: "play", path: [0, 40, 3] });
		expect(ann.board).toMatchObject({
			seq: 7,
			ok: false,
			error: "not-adjacent",
		});
		room.move("guest-ann", 8, { type: "play", path: [99, 100, 101] });
		expect(ann.board).toMatchObject({ seq: 8, ok: false, error: "bad-path" });
		expect(ann.board.state).toEqual(before);
	});

	it("gives the win to the higher score at time-up", () => {
		const { room, ann, bob } = duel();
		const [word] = findWords(bob.board.state.board, dictionary);
		room.move("guest-bob", 1, { type: "play", path: word.path });
		vi.advanceTimersByTime(180_000);
		expect(room.phase).toBe("finished");
		const bobSeat = bob.room.you;
		expect(ann.room.result).toMatchObject({
			winnerSeatId: bobSeat,
			reason: "time",
		});
		room.move("guest-ann", 2, { type: "shuffle" });
		expect(ann.board).toMatchObject({ ok: false, error: "not-playing" });
	});

	it("breaks a tie in favour of whoever reached the score first", () => {
		const { room, ann, bob } = duel({ newGame: catGame(false) }, smallWords);
		room.move("guest-bob", 1, { type: "play", path: down(0, 0, 3) });
		vi.advanceTimersByTime(5_000);
		room.move("guest-ann", 1, { type: "play", path: down(0, 0, 3) });
		expect(ann.board.state.score).toBe(bob.board.state.score);
		vi.advanceTimersByTime(180_000);
		expect(ann.room.result?.winnerSeatId).toBe(bob.room.you);
	});

	it("calls a draw when nobody scores", () => {
		const { ann } = duel();
		vi.advanceTimersByTime(180_000);
		expect(ann.room.result).toMatchObject({
			winnerSeatId: null,
			reason: "time",
		});
		expect(ann.room.result?.standings.map((s) => s.place)).toEqual([1, 1]);
	});

	it("ends the duel at once when a tower falls", () => {
		const { room, ann, bob } = duel({ newGame: catGame(true) }, smallWords);
		room.move("guest-ann", 1, { type: "play", path: down(0, 0, 3) });
		expect(room.phase).toBe("finished");
		expect(bob.room.result).toMatchObject({
			winnerSeatId: bob.room.you,
			reason: "tower",
		});
		expect(ann.room.seats.find((s) => s.seatId === ann.room.you)?.out).toBe(
			"tower",
		);
	});
});

describe("connections", () => {
	it("keeps the seat and board through a quick reconnect", () => {
		const { room, ann, bob } = duel();
		const board = ann.board.state;
		room.detach("guest-ann", ann);
		expect(bob.room.seats[0].connected).toBe(false);
		vi.advanceTimersByTime(RECONNECT_GRACE_MS - 1000);
		const again = new FakeConnection();
		room.attach("guest-ann", again);
		expect(again.board.state).toEqual(board);
		expect(again.room.phase).toBe("playing");
		vi.advanceTimersByTime(RECONNECT_GRACE_MS);
		expect(room.phase).toBe("playing");
	});

	it("awards the duel to the other player when someone stays away", () => {
		const { room, ann, bob } = duel();
		room.detach("guest-bob", bob);
		vi.advanceTimersByTime(RECONNECT_GRACE_MS);
		expect(room.phase).toBe("finished");
		expect(ann.room.result).toMatchObject({
			winnerSeatId: ann.room.you,
			reason: "left",
		});
	});

	it("treats leaving mid-match as a forfeit", () => {
		const { room, ann, bob } = duel();
		room.leave("guest-bob");
		expect(bob.last("left")).toBeDefined();
		expect(ann.room.result).toMatchObject({
			winnerSeatId: ann.room.you,
			reason: "left",
		});
	});

	it("ignores a stale socket closing after its seat moved to a new one", () => {
		const { room, ann, bob } = duel();
		const again = new FakeConnection();
		room.attach("guest-ann", again);
		room.detach("guest-ann", ann);
		expect(bob.room.seats[0].connected).toBe(true);
	});
});

describe("AI rivals", () => {
	it("plays its own words until the match ends", () => {
		const room = makeRoom();
		const ann = new FakeConnection();
		room.join("guest-ann", "Ann", ann);
		expect(room.addBot("guest-ann", "hard")).toBeNull();
		room.start("guest-ann");
		vi.advanceTimersByTime(COUNTDOWN_MS + 30_000);
		const bot = ann.room.seats.find((s) => s.bot === "hard");
		expect(bot?.name).toBe("Archmage Morwen");
		expect(bot?.score).toBeGreaterThan(0);
		vi.advanceTimersByTime(180_000);
		expect(room.phase).toBe("finished");
	});

	it("lets the host remove an AI rival in the lobby", () => {
		const room = makeRoom();
		const ann = new FakeConnection();
		room.join("guest-ann", "Ann", ann);
		room.addBot("guest-ann", "easy");
		const botSeat = ann.room.seats[1].seatId;
		expect(room.removeBot("guest-ann", botSeat)).toBeNull();
		expect(ann.room.seats).toHaveLength(1);
	});
});

describe("rematch", () => {
	it("returns everyone to the lobby with fresh seats", () => {
		const { room, ann } = duel();
		vi.advanceTimersByTime(180_000);
		expect(room.rematch("guest-ann")).toBeNull();
		expect(ann.room).toMatchObject({ phase: "waiting", result: null });
		expect(ann.room.seats.every((s) => s.score === 0 && s.out === null)).toBe(
			true,
		);
		expect(room.start("guest-ann")).toBeNull();
	});
});

it("keeps public games free of server-only fields", () => {
	const state: GameState = catGame(false)("secret");
	const { ann } = duel({ newGame: () => state }, smallWords);
	expect(JSON.stringify(ann.messages)).not.toContain("secret");
});

/** A Siege with these human players (plus Hard bots), past the countdown. */
function siege(
	names: readonly string[],
	{
		bots = 0,
		overrides = {},
		words,
	}: { bots?: number; overrides?: Partial<RoomDeps>; words?: WordList } = {},
) {
	const room = makeRoom(overrides, words, "siege");
	const players = names.map((name) => {
		const connection = new FakeConnection();
		room.join(`guest-${name}`, name, connection);
		return connection;
	});
	for (let i = 0; i < bots; i++) room.addBot(`guest-${names[0]}`, "hard");
	expect(room.start(`guest-${names[0]}`)).toBeNull();
	vi.advanceTimersByTime(COUNTDOWN_MS);
	return { room, players, host: players[0] };
}

const ROUND_MS = 60_000;
const outOf = (connection: FakeConnection) =>
	connection.room.seats.filter((seat) => seat.out !== null);
const seatNamed = (connection: FakeConnection, name: string) =>
	connection.room.seats.find((seat) => seat.name === name);

describe("Siege", () => {
	it("seats up to five wizards and needs two to start", () => {
		const room = makeRoom({}, dictionary, "siege");
		room.join("guest-1", "One", new FakeConnection());
		expect(room.start("guest-1")).toBe("need-two-players");
		for (let i = 2; i <= 5; i++) {
			expect(room.join(`guest-${i}`, `P${i}`, new FakeConnection())).toBeNull();
		}
		expect(room.join("guest-6", "Six", new FakeConnection())).toBe("room-full");
	});

	it("cuts the lowest score each round until one wizard is left", () => {
		const { room, host } = siege(["Ann", "Bob", "Cy"], { bots: 2 });
		expect(host.room).toMatchObject({
			mode: "siege",
			round: 1,
			phase: "playing",
		});
		for (let round = 1; round <= 4; round++) {
			vi.advanceTimersByTime(ROUND_MS);
			expect(outOf(host)).toHaveLength(round);
			expect(host.room.cut?.round).toBe(round);
			const cut = host.room.seats.find(
				(s) => s.seatId === host.room.cut?.seatId,
			);
			expect(cut).toMatchObject({ out: "cut", outRound: round });
			if (round < 4) {
				expect(host.room.phase).toBe("roundEnd");
				vi.advanceTimersByTime(ROUND_BREAK_MS);
				expect(host.room).toMatchObject({ phase: "playing", round: round + 1 });
			}
		}
		expect(room.phase).toBe("finished");
		const result = host.room.result;
		expect(result?.reason).toBe("last-standing");
		expect(result?.standings.map((s) => s.place)).toEqual([1, 2, 3, 4, 5]);
		expect(result?.standings[0].out).toBeNull();
		expect(result?.standings.slice(1).map((s) => s.outRound)).toEqual([
			4, 3, 2, 1,
		]);
	});

	it("keeps whoever reached a tied score first", () => {
		const { room, host } = siege(["Ann", "Bob", "Cy"], {
			overrides: { newGame: catGame(false) },
			words: smallWords,
		});
		vi.advanceTimersByTime(1000);
		room.move("guest-Ann", 1, { type: "play", path: down(0, 0, 3) });
		vi.advanceTimersByTime(4000);
		room.move("guest-Cy", 1, { type: "play", path: down(0, 0, 3) });
		vi.advanceTimersByTime(ROUND_MS - 5000);
		expect(seatNamed(host, "Bob")?.out).toBe("cut");
		vi.advanceTimersByTime(ROUND_BREAK_MS + ROUND_MS);
		expect(seatNamed(host, "Ann")?.score).toBe(seatNamed(host, "Cy")?.score);
		expect(seatNamed(host, "Cy")?.out).toBe("cut");
		expect(host.room.result?.winnerSeatId).toBe(seatNamed(host, "Ann")?.seatId);
	});

	it("still cuts exactly one when nobody has scored", () => {
		const { host } = siege(["Ann", "Bob", "Cy"]);
		vi.advanceTimersByTime(ROUND_MS);
		expect(outOf(host)).toHaveLength(1);
	});

	it("knocks out a fallen tower at once while the round carries on", () => {
		const { room, host } = siege(["Ann", "Bob", "Cy"], {
			overrides: { newGame: catGame(true) },
			words: smallWords,
		});
		room.move("guest-Ann", 1, { type: "play", path: down(0, 0, 3) });
		expect(seatNamed(host, "Ann")).toMatchObject({ out: "tower", outRound: 1 });
		expect(host.room.phase).toBe("playing");
		vi.advanceTimersByTime(ROUND_MS);
		expect(room.phase).toBe("finished");
		expect(host.room.result?.reason).toBe("last-standing");
		expect(host.room.result?.standings.at(-1)?.name).toBe("Ann");
	});

	it("ignores moves during the break between rounds", () => {
		const { room, players } = siege(["Ann", "Bob", "Cy"]);
		vi.advanceTimersByTime(ROUND_MS);
		const survivor = players.findIndex((p) => {
			const me = p.room.seats.find((s) => s.seatId === p.room.you);
			return me?.out === null;
		});
		const name = ["Ann", "Bob", "Cy"][survivor];
		room.move(`guest-${name}`, 5, { type: "shuffle" });
		expect(players[survivor].board).toMatchObject({
			seq: 5,
			ok: false,
			error: "not-playing",
		});
	});

	it("puts out a player who stays disconnected, and carries on", () => {
		const { room, players, host } = siege(["Ann", "Bob", "Cy"]);
		room.detach("guest-Cy", players[2]);
		vi.advanceTimersByTime(RECONNECT_GRACE_MS);
		expect(seatNamed(host, "Cy")?.out).toBe("left");
		expect(host.room.phase).toBe("playing");
	});

	it("names repeated AI rivals apart", () => {
		const room = makeRoom({}, dictionary, "siege");
		const ann = new FakeConnection();
		room.join("guest-ann", "Ann", ann);
		for (let i = 0; i < 4; i++) room.addBot("guest-ann", "medium");
		expect(ann.room.seats.slice(1).map((s) => s.name)).toEqual([
			"Adept Elowen",
			"Adept Elowen II",
			"Adept Elowen III",
			"Adept Elowen IV",
		]);
	});
});
