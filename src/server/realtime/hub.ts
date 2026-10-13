// Every open game socket goes through the hub: it checks messages, knows which guest is in
// which room, and hands moves to that room.
import { randomInt, randomUUID } from "node:crypto";
import type { WordList } from "../../game/types";
import { nameProblem, tidyName } from "../../shared/names";
import {
	type ClientMessage,
	ClientMessageSchema,
	type ErrorCode,
	MAX_MESSAGE_BYTES,
	type ServerMessage,
} from "../../shared/protocol";
import { startBot } from "../bot/bot";
import { type Connection, Room, type RoomError } from "./room";

/** No look-alike characters (I/1, O/0, L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;

/** Token bucket per socket: a burst of BURST messages, refilled at REFILL_PER_SEC. */
const BURST = 30;
const REFILL_PER_SEC = 15;

const MESSAGES: Record<ErrorCode, string> = {
	"bad-message": "The game didn't understand that message.",
	"say-hello-first": "Connect with a name before doing that.",
	"old-version": "This page is out of date. Refresh to get the latest version.",
	"name-not-allowed": "Pick a different name.",
	"room-not-found": "There's no room with that code. Check it and try again.",
	"room-full": "That room already has two wizards.",
	"match-running": "That match has already started.",
	"not-host": "Only the room's host can do that.",
	"not-in-room": "You're not in a room.",
	"need-two-players":
		"A duel needs two wizards. Invite a friend or add an AI rival.",
	"rate-limited": "Slow down a little.",
};

const NAME_MESSAGES = {
	"too-short": "Names need at least 2 characters.",
	"too-long": "Names can be at most 16 characters.",
	"bad-characters": "Use letters, numbers, spaces, ' _ or - in your name.",
	"not-allowed": "Pick a different name.",
} as const;

interface Client {
	readonly id: string;
	readonly connection: Connection;
	guestId: string | null;
	name: string;
	tokens: number;
	refilledAt: number;
}

export interface HubDeps {
	readonly loadWords: () => Promise<WordList>;
	readonly randomId?: () => string;
	readonly now?: () => number;
	/** Randomness for bot decisions (tests pass a seeded one). */
	readonly botRandom?: () => number;
}

export class Hub {
	readonly rooms = new Map<string, Room>();
	private readonly clients = new Map<string, Client>();
	/** Which room each guest has a seat in. */
	private readonly guestRooms = new Map<string, string>();
	private words: Promise<WordList> | null = null;

	constructor(private readonly deps: HubDeps) {}

	private now(): number {
		return this.deps.now?.() ?? Date.now();
	}

	private loadWords(): Promise<WordList> {
		this.words ??= this.deps.loadWords().catch((error: unknown) => {
			this.words = null;
			throw error;
		});
		return this.words;
	}

	connect(id: string, send: (message: ServerMessage) => void): void {
		this.clients.set(id, {
			id,
			connection: { send },
			guestId: null,
			name: "",
			tokens: BURST,
			refilledAt: this.now(),
		});
	}

	disconnect(id: string): void {
		const client = this.clients.get(id);
		if (!client) return;
		this.clients.delete(id);
		if (client.guestId)
			this.roomOf(client.guestId)?.detach(client.guestId, client.connection);
	}

	async receive(id: string, text: string): Promise<void> {
		const client = this.clients.get(id);
		if (!client) return;
		if (!this.takeToken(client)) {
			this.fail(client, "rate-limited");
			return;
		}
		if (text.length > MAX_MESSAGE_BYTES) {
			this.fail(client, "bad-message");
			return;
		}
		let parsed: ReturnType<typeof ClientMessageSchema.safeParse>;
		try {
			parsed = ClientMessageSchema.safeParse(JSON.parse(text));
		} catch {
			this.fail(client, "bad-message");
			return;
		}
		if (!parsed.success) {
			this.fail(client, "bad-message");
			return;
		}
		await this.handle(client, parsed.data);
	}

	private takeToken(client: Client): boolean {
		const now = this.now();
		client.tokens = Math.min(
			BURST,
			client.tokens + ((now - client.refilledAt) / 1000) * REFILL_PER_SEC,
		);
		client.refilledAt = now;
		if (client.tokens < 1) return false;
		client.tokens -= 1;
		return true;
	}

	private fail(
		client: Client,
		code: ErrorCode | RoomError,
		message = MESSAGES[code],
	): void {
		client.connection.send({ type: "error", code, message });
	}

	private roomOf(guestId: string): Room | undefined {
		const code = this.guestRooms.get(guestId);
		return code ? this.rooms.get(code) : undefined;
	}

	private async handle(client: Client, message: ClientMessage): Promise<void> {
		if (message.type === "ping") {
			client.connection.send({
				type: "pong",
				t: message.t,
				serverNow: this.now(),
			});
			return;
		}
		if (message.type === "hello") {
			const name = tidyName(message.nickname);
			const problem = nameProblem(name);
			if (problem) {
				this.fail(client, "name-not-allowed", NAME_MESSAGES[problem]);
				return;
			}
			client.guestId = message.guestId;
			client.name = name;
			client.connection.send({ type: "welcome", serverNow: this.now() });
			this.roomOf(message.guestId)?.attach(message.guestId, client.connection);
			return;
		}
		const guestId = client.guestId;
		if (!guestId) {
			this.fail(client, "say-hello-first");
			return;
		}
		const room = this.roomOf(guestId);
		const report = (error: RoomError | null) => {
			if (error) this.fail(client, error);
		};

		switch (message.type) {
			case "createRoom": {
				const words = await this.loadWords();
				room?.leave(guestId);
				const created = new Room(
					this.newCode(),
					message.durationSec,
					this.roomDeps(words),
				);
				this.rooms.set(created.code, created);
				this.guestRooms.set(guestId, created.code);
				created.join(guestId, client.name, client.connection);
				if (message.bot) {
					created.addBot(guestId, message.bot);
					created.start(guestId);
				}
				return;
			}
			case "joinRoom": {
				const target = this.rooms.get(message.code);
				if (!target) {
					this.fail(client, "room-not-found");
					return;
				}
				if (room && room !== target) room.leave(guestId);
				const error = target.join(guestId, client.name, client.connection);
				if (error) this.fail(client, error);
				else this.guestRooms.set(guestId, target.code);
				return;
			}
			case "leaveRoom":
				if (room) room.leave(guestId);
				else client.connection.send({ type: "left" });
				return;
		}

		if (!room) {
			this.fail(client, "not-in-room");
			return;
		}
		switch (message.type) {
			case "addBot":
				return report(room.addBot(guestId, message.difficulty));
			case "removeSeat":
				return report(room.removeBot(guestId, message.seatId));
			case "setDuration":
				return report(room.setDuration(guestId, message.durationSec));
			case "start":
				return report(room.start(guestId));
			case "rematch":
				return report(room.rematch(guestId));
			case "play":
				room.move(guestId, message.seq, { type: "play", path: message.path });
				return;
			case "shuffle":
				room.move(guestId, message.seq, { type: "shuffle" });
				return;
		}
	}

	private newCode(): string {
		for (;;) {
			const code = Array.from(
				{ length: CODE_LENGTH },
				() => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
			).join("");
			if (!this.rooms.has(code)) return code;
		}
	}

	private roomDeps(words: WordList) {
		return {
			words,
			randomId: this.deps.randomId ?? randomUUID,
			now: this.deps.now,
			onSeatGone: (guestId: string, room: Room) => {
				if (this.guestRooms.get(guestId) === room.code)
					this.guestRooms.delete(guestId);
			},
			onClose: (room: Room) => {
				this.rooms.delete(room.code);
			},
			startBot: (
				room: Room,
				seatId: string,
				difficulty: Parameters<typeof startBot>[2],
			) => startBot(room, seatId, difficulty, words, this.deps.botRandom),
		};
	}
}
