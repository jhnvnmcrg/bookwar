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
	RECONNECT_GRACE_MS,
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
) {
	onClose = vi.fn<(room: Room) => void>();
	const random = Rng.fromSeed("bots");
	return new Room("ABCDE", 180, {
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
