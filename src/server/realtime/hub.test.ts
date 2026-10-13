import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDictionary } from "../../game/dictionary";
import {
	PROTOCOL_VERSION,
	RECONNECT_GRACE_MS,
	type ServerMessage,
} from "../../shared/protocol";
import { Hub } from "./hub";

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
		await socket.send({ type: "createRoom", durationSec: 180 });
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
		await socket.send("x".repeat(5000));
		expect(socket.last("error")?.code).toBe("bad-message");
	});

	it("creates a room and lets a second player join it by code", async () => {
		const ann = new Socket(hub, "s1");
		const bob = new Socket(hub, "s2");
		await ann.hello(ANN, "Ann");
		await bob.hello(BOB, "Bob");
		await ann.send({ type: "createRoom", durationSec: 120 });
		const code = ann.last("room")?.room.code ?? "";
		expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
		await bob.send({ type: "joinRoom", code: "ZZZZZ" });
		expect(bob.last("error")?.code).toBe("room-not-found");
		await bob.send({ type: "joinRoom", code });
		expect(ann.last("room")?.room.seats.map((s) => s.name)).toEqual([
			"Ann",
			"Bob",
		]);
		expect(ann.last("room")?.room.durationSec).toBe(120);
	});

	it("starts a match against an AI rival straight away", async () => {
		const ann = new Socket(hub, "s1");
		await ann.hello(ANN, "Ann");
		await ann.send({ type: "createRoom", durationSec: 180, bot: "medium" });
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
		await ann.send({ type: "createRoom", durationSec: 180 });
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
