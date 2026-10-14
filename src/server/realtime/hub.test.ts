import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDictionary } from "../../game/dictionary";
import {
	PROTOCOL_VERSION,
	RECONNECT_GRACE_MS,
	type ServerMessage,
} from "../../shared/protocol";
import { Hub, type MatchRecord } from "./hub";

class Socket {
	readonly messages: ServerMessage[] = [];
	constructor(
		readonly hub: Hub,
		readonly id: string,
	) {
		hub.connect(id, (message) => this.messages.push(message));
	}
	send(message: unknown) {
		return this.hub.receive(
			this.id,
			typeof message === "string" ? message : JSON.stringify(message),
		);
	}
	hello(guestId: string, nickname: string) {
		return this.send({ type: "hello", v: PROTOCOL_VERSION, guestId, nickname });
	}
	last<T extends ServerMessage["type"]>(type: T) {
		return this.messages.findLast(
			(m): m is Extract<ServerMessage, { type: T }> => m.type === type,
		);
	}
}

const ANN = "guest-ann-0000000000";
const BOB = "guest-bob-0000000000";

let hub: Hub;
beforeEach(() => {
	vi.useFakeTimers();
	hub = new Hub({ loadWords: loadDictionary });
});
afterEach(() => {
	vi.useRealTimers();
});

describe("Hub", () => {
	it("needs a hello with an acceptable name first", async () => {
		const socket = new Socket(hub, "s1");
		await socket.send({ type: "createRoom", mode: "duel", seconds: 180 });
		expect(socket.last("error")?.code).toBe("say-hello-first");
		await socket.hello(ANN, "x");
		expect(socket.last("error")?.message).toContain("at least 2");
		await socket.hello(ANN, "  Ann   the  Bold ");
		expect(socket.last("welcome")).toBeDefined();
	});

	it("rejects junk", async () => {
		const socket = new Socket(hub, "s1");
		await socket.send("{not json");
		expect(socket.last("error")?.code).toBe("bad-message");
		await socket.send({ type: "explode" });
		expect(socket.last("error")?.code).toBe("bad-message");
		await socket.send({ type: "hello", v: 99, guestId: ANN, nickname: "Ann" });
		expect(socket.last("error")?.code).toBe("bad-message");
		await socket.send("x".repeat(9000));
		expect(socket.last("error")?.code).toBe("bad-message");
	});

	it("creates a room and lets a second player join it by code", async () => {
		const ann = new Socket(hub, "s1");
		const bob = new Socket(hub, "s2");
		await ann.hello(ANN, "Ann");
		await bob.hello(BOB, "Bob");
		await ann.send({ type: "createRoom", mode: "duel", seconds: 120 });
		const code = ann.last("room")?.room.code ?? "";
		expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
		await bob.send({ type: "joinRoom", code: "ZZZZZ" });
		expect(bob.last("error")?.code).toBe("room-not-found");
		await bob.send({ type: "joinRoom", code });
		expect(ann.last("room")?.room.seats.map((s) => s.name)).toEqual([
			"Ann",
			"Bob",
		]);
		expect(ann.last("room")?.room.seconds).toBe(120);
	});

	it("starts a match against an AI rival straight away", async () => {
		const ann = new Socket(hub, "s1");
		await ann.hello(ANN, "Ann");
		await ann.send({
			type: "createRoom",
			mode: "duel",
			seconds: 180,
			ai: { difficulty: "medium", count: 1 },
		});
		const room = ann.last("room")?.room;
		expect(room?.phase).toBe("countdown");
		expect(room?.seats[1]).toMatchObject({
			bot: "medium",
			name: "Adept Elowen",
		});
	});

	it("puts a returning guest back in their seat", async () => {
		const ann = new Socket(hub, "s1");
		const bob = new Socket(hub, "s2");
		await ann.hello(ANN, "Ann");
		await bob.hello(BOB, "Bob");
		await ann.send({ type: "createRoom", mode: "duel", seconds: 180 });
		const code = ann.last("room")?.room.code ?? "";
		await bob.send({ type: "joinRoom", code });
		await ann.send({ type: "start" });
		vi.advanceTimersByTime(3000);
		const board = bob.last("board")?.state;

		hub.disconnect("s2");
		vi.advanceTimersByTime(RECONNECT_GRACE_MS / 2);
		const back = new Socket(hub, "s3");
		await back.hello(BOB, "Bob");
		expect(back.last("room")?.room.phase).toBe("playing");
		expect(back.last("board")?.state).toEqual(board);
	});

	it("only lets players act in their own room", async () => {
		const ann = new Socket(hub, "s1");
		await ann.hello(ANN, "Ann");
		await ann.send({ type: "start" });
		expect(ann.last("error")?.code).toBe("not-in-room");
	});

	it("rate-limits floods", async () => {
		const socket = new Socket(hub, "s1");
		for (let i = 0; i < 40; i++) await socket.send({ type: "ping", t: i });
		expect(socket.last("error")?.code).toBe("rate-limited");
		vi.advanceTimersByTime(2000);
		await socket.send({ type: "ping", t: 99 });
		expect(socket.last("pong")?.t).toBe(99);
	});
});

describe("quick match", () => {
	const players = async (count: number) => {
		const sockets: Socket[] = [];
		for (let i = 0; i < count; i++) {
			const socket = new Socket(hub, `q${i}`);
			await socket.hello(`guest-quick-${i}-000000000`, `Wiz${i}`);
			sockets.push(socket);
		}
		return sockets;
	};

	it("starts a Duel as soon as two wizards are waiting", async () => {
		const [a, b] = await players(2);
		await a.send({ type: "quickMatch", mode: "duel" });
		expect(a.last("queue")?.queue).toMatchObject({
			mode: "duel",
			players: 1,
			alone: false,
		});
		await b.send({ type: "quickMatch", mode: "duel" });
		expect(a.last("room")?.room).toMatchObject({
			mode: "duel",
			phase: "countdown",
		});
		expect(b.last("room")?.room.seats).toHaveLength(2);
		expect(a.last("queue")?.queue).toBeNull();
	});

	it("starts a Siege with whoever is there after 30 seconds", async () => {
		const sockets = await players(3);
		for (const socket of sockets)
			await socket.send({ type: "quickMatch", mode: "siege" });
		expect(sockets[2].last("queue")?.queue).toMatchObject({ players: 3 });
		expect(sockets[2].last("queue")?.queue?.startsAt).toBeGreaterThan(
			Date.now(),
		);
		vi.advanceTimersByTime(30_000);
		expect(sockets[0].last("room")?.room).toMatchObject({
			mode: "siege",
			phase: "countdown",
		});
		expect(sockets[0].last("room")?.room.seats).toHaveLength(3);
	});

	it("starts a full Siege straight away", async () => {
		const sockets = await players(5);
		for (const socket of sockets)
			await socket.send({ type: "quickMatch", mode: "siege" });
		expect(sockets[4].last("room")?.room.seats).toHaveLength(5);
	});

	it("tells a lone player after 30 seconds, and still matches a late arrival", async () => {
		const [a, b] = await players(2);
		await a.send({ type: "quickMatch", mode: "duel" });
		vi.advanceTimersByTime(30_000);
		expect(a.last("queue")?.queue).toMatchObject({ players: 1, alone: true });
		await b.send({ type: "quickMatch", mode: "duel" });
		expect(a.last("room")?.room.phase).toBe("countdown");
	});

	it("takes players out of the queue when they cancel or disconnect", async () => {
		const [a, b, c] = await players(3);
		await a.send({ type: "quickMatch", mode: "duel" });
		await a.send({ type: "cancelQueue" });
		expect(a.last("queue")?.queue).toBeNull();
		await b.send({ type: "quickMatch", mode: "duel" });
		hub.disconnect("q1");
		await c.send({ type: "quickMatch", mode: "duel" });
		expect(c.last("room")).toBeUndefined();
		expect(c.last("queue")?.queue).toMatchObject({ players: 1 });
	});

	it("checks the time setting for the mode, and seats AI rivals on request", async () => {
		const [a] = await players(1);
		await a.send({ type: "createRoom", mode: "siege", seconds: 180 });
		expect(a.last("error")?.code).toBe("bad-setting");
		await a.send({
			type: "createRoom",
			mode: "siege",
			seconds: 30,
			ai: { difficulty: "easy", count: 4 },
		});
		expect(a.last("room")?.room.seats).toHaveLength(5);
		expect(a.last("room")?.room.phase).toBe("countdown");
	});
});

describe("signed-in players", () => {
	let recorded: MatchRecord[];
	const helloWith = (
		socket: Socket,
		guestId: string,
		name: string,
		token?: string,
	) =>
		socket.send({
			type: "hello",
			v: PROTOCOL_VERSION,
			guestId,
			nickname: name,
			token,
		});

	beforeEach(() => {
		recorded = [];
		hub = new Hub({
			loadWords: loadDictionary,
			verifyToken: async (token) => (token === "ann-token" ? "user-ann" : null),
			recordMatch: async (record) => {
				recorded.push(record);
			},
		});
	});

	it("keeps a finished match with the account behind each signed-in seat", async () => {
		const ann = new Socket(hub, "s1");
		const bob = new Socket(hub, "s2");
		await helloWith(ann, ANN, "Ann", "ann-token");
		await helloWith(bob, BOB, "Bob", "forged-token");
		await vi.waitFor(() => expect(hub.accountOf(ANN)).toBe("user-ann"));
		expect(hub.accountOf(BOB)).toBeNull();

		await ann.send({ type: "createRoom", mode: "duel", seconds: 120 });
		await bob.send({ type: "joinRoom", code: ann.last("room")?.room.code });
		await ann.send({ type: "start" });
		vi.advanceTimersByTime(3000 + 120_000);

		expect(ann.last("room")?.room.phase).toBe("finished");
		expect(recorded).toHaveLength(1);
		const [record] = recorded;
		expect(record).toMatchObject({ mode: "duel", seconds: 120, rounds: 1 });
		expect(record.reason).toBe("time");
		expect(record.endedAt - record.startedAt).toBe(120_000);
		expect(
			record.players.map(({ seat, userId, name, bot }) => ({
				seat,
				userId,
				name,
				bot,
			})),
		).toEqual([
			{ seat: 0, userId: "user-ann", name: "Ann", bot: null },
			{ seat: 1, userId: null, name: "Bob", bot: null },
		]);
		// Nobody cast a word, so the duel is a draw.
		expect(record.players.map(({ place, won }) => ({ place, won }))).toEqual([
			{ place: 1, won: false },
			{ place: 1, won: false },
		]);
	});

	it("keeps a siege against the AI that the only player walked out of", async () => {
		const ann = new Socket(hub, "s1");
		await helloWith(ann, ANN, "Ann", "ann-token");
		await vi.waitFor(() => expect(hub.accountOf(ANN)).toBe("user-ann"));
		await ann.send({
			type: "createRoom",
			mode: "siege",
			seconds: 30,
			ai: { difficulty: "easy", count: 4 },
		});
		vi.advanceTimersByTime(3000);
		await ann.send({ type: "leaveRoom" });

		expect(hub.rooms.size).toBe(0);
		expect(recorded).toHaveLength(1);
		const [record] = recorded;
		expect(record).toMatchObject({ mode: "siege", reason: "left", rounds: 1 });
		expect(record.players).toHaveLength(5);
		expect(record.players[0]).toMatchObject({
			userId: "user-ann",
			place: 5,
			won: false,
			out: "left",
			outRound: 1,
		});
		expect(record.players.filter((player) => player.won)).toHaveLength(1);
	});

	it("keeps a siege against the AI whose only player never came back", async () => {
		const ann = new Socket(hub, "s1");
		await helloWith(ann, ANN, "Ann", "ann-token");
		await vi.waitFor(() => expect(hub.accountOf(ANN)).toBe("user-ann"));
		await ann.send({
			type: "createRoom",
			mode: "siege",
			seconds: 60,
			ai: { difficulty: "easy", count: 2 },
		});
		vi.advanceTimersByTime(3000);
		hub.disconnect("s1");
		vi.advanceTimersByTime(RECONNECT_GRACE_MS);

		expect(hub.rooms.size).toBe(0);
		expect(recorded).toHaveLength(1);
		expect(recorded[0].players[0]).toMatchObject({
			userId: "user-ann",
			out: "left",
			place: 3,
		});
	});

	it("doesn't keep matches that no signed-in player was in", async () => {
		const bob = new Socket(hub, "s1");
		await helloWith(bob, BOB, "Bob");
		await bob.send({
			type: "createRoom",
			mode: "duel",
			seconds: 120,
			ai: { difficulty: "easy", count: 1 },
		});
		vi.advanceTimersByTime(3000 + 120_000);
		expect(bob.last("room")?.room.phase).toBe("finished");
		expect(recorded).toEqual([]);
	});

	it("forgets the account after a hello without a token (signed out)", async () => {
		const ann = new Socket(hub, "s1");
		await helloWith(ann, ANN, "Ann", "ann-token");
		await vi.waitFor(() => expect(hub.accountOf(ANN)).toBe("user-ann"));
		await helloWith(ann, ANN, "Ann");
		expect(hub.accountOf(ANN)).toBeNull();
	});

	it("forgets the account when a guest who isn't in a room goes", async () => {
		const ann = new Socket(hub, "s1");
		await helloWith(ann, ANN, "Ann", "ann-token");
		await vi.waitFor(() => expect(hub.accountOf(ANN)).toBe("user-ann"));
		hub.disconnect("s1");
		expect(hub.accountOf(ANN)).toBeNull();
	});
});

describe("limits", () => {
	const connectFrom = (target: Hub, id: string, address: string) => {
		const messages: ServerMessage[] = [];
		const accepted = target.connect(id, (m) => messages.push(m), address);
		return { accepted, messages };
	};

	it("caps open sockets per address and for the whole server", () => {
		const limited = new Hub({
			loadWords: loadDictionary,
			limits: { connections: 3, connectionsPerAddress: 2 },
		});
		expect(connectFrom(limited, "a1", "10.0.0.1").accepted).toBe(true);
		expect(connectFrom(limited, "a2", "10.0.0.1").accepted).toBe(true);
		const third = connectFrom(limited, "a3", "10.0.0.1");
		expect(third.accepted).toBe(false);
		expect(third.messages[0]).toMatchObject({
			type: "error",
			code: "too-many-connections",
		});
		expect(connectFrom(limited, "b1", "10.0.0.2").accepted).toBe(true);
		expect(connectFrom(limited, "c1", "10.0.0.3").messages[0]).toMatchObject({
			code: "server-busy",
		});
		limited.disconnect("a1");
		expect(connectFrom(limited, "a4", "10.0.0.1").accepted).toBe(true);
	});

	it("limits how fast one guest opens rooms", async () => {
		const limited = new Hub({
			loadWords: loadDictionary,
			limits: { roomsPerMinute: 2 },
		});
		const ann = new Socket(limited, "s1");
		await ann.hello(ANN, "Ann");
		for (let i = 0; i < 2; i++)
			await ann.send({ type: "createRoom", mode: "duel", seconds: 120 });
		expect(limited.rooms.size).toBe(1);
		await ann.send({ type: "createRoom", mode: "duel", seconds: 120 });
		expect(ann.last("error")?.code).toBe("rate-limited");
		vi.advanceTimersByTime(60_000);
		await ann.send({ type: "createRoom", mode: "duel", seconds: 120 });
		expect(ann.last("room")).toBeDefined();
	});

	it("turns new rooms and quick matches away when the server is full", async () => {
		const limited = new Hub({
			loadWords: loadDictionary,
			limits: { rooms: 1 },
		});
		const ann = new Socket(limited, "s1");
		const bob = new Socket(limited, "s2");
		await ann.hello(ANN, "Ann");
		await bob.hello(BOB, "Bob");
		await ann.send({ type: "createRoom", mode: "duel", seconds: 120 });
		await bob.send({ type: "createRoom", mode: "duel", seconds: 120 });
		expect(bob.last("error")?.code).toBe("server-busy");
		await bob.send({ type: "quickMatch", mode: "duel" });
		expect(bob.last("error")?.code).toBe("server-busy");
		// Joining an existing room still works.
		await bob.send({ type: "joinRoom", code: ann.last("room")?.room.code });
		expect(bob.last("room")?.room.seats).toHaveLength(2);
	});
});
