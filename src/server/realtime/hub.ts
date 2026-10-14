// Every open game socket goes through the hub: it checks messages, knows which guest is in
// which room (or quick-match queue), and hands moves to that room.
import { randomInt, randomUUID } from "node:crypto";
import type { WordList } from "../../game/types";
import { nameProblem, tidyName } from "../../shared/names";
import {
	type ClientMessage,
	ClientMessageSchema,
	DEFAULT_SECONDS,
	type ErrorCode,
	MAX_MESSAGE_BYTES,
	type MatchMode,
	MODE_SEATS,
	QUICK_WAIT_MS,
	type ServerMessage,
} from "../../shared/protocol";
import { startBot } from "../bot/bot";
import { RateLimiter } from "../rate-limit.server";
import {
	type Connection,
	type MatchSummary,
	Room,
	type RoomDeps,
	type RoomError,
} from "./room";

/** No look-alike characters (I/1, O/0, L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;

/** Token bucket per socket: a burst of BURST messages, refilled at REFILL_PER_SEC. */
const BURST = 30;
const REFILL_PER_SEC = 15;

/** Caps that keep one busy (or hostile) client from taking the whole server down. */
export interface HubLimits {
	/** Open sockets for the whole server. */
	readonly connections: number;
	/** Open sockets from one network address. */
	readonly connectionsPerAddress: number;
	/** Rooms open at once (lobbies, matches and results screens). */
	readonly rooms: number;
	/** Rooms one guest may create per minute. */
	readonly roomsPerMinute: number;
}

const LIMITS: HubLimits = {
	connections: 5000,
	connectionsPerAddress: 16,
	rooms: 2000,
	roomsPerMinute: 12,
};

const MESSAGES: Record<ErrorCode, string> = {
	"bad-message": "The game didn't understand that message.",
	"say-hello-first": "Connect with a name before doing that.",
	"old-version": "This page is out of date. Refresh to get the latest version.",
	"name-not-allowed": "Pick a different name.",
	"room-not-found": "There's no room with that code. Check it and try again.",
	"room-full": "That room is full.",
	"match-running": "That match has already started.",
	"not-host": "Only the room's host can do that.",
	"not-in-room": "You're not in a room.",
	"need-two-players":
		"A match needs at least two wizards. Invite a friend or add an AI rival.",
	"bad-setting": "That setting isn't available for this match.",
	"rate-limited": "Slow down a little.",
	"server-busy":
		"The game server is full right now. Try again in a few minutes.",
	"too-many-connections":
		"Too many Bookwar windows are open from your network. Close some and try again.",
};

const NAME_MESSAGES = {
	"too-short": "Names need at least 2 characters.",
	"too-long": "Names can be at most 16 characters.",
	"bad-characters": "Use letters, numbers, spaces, ' _ or - in your name.",
	"not-allowed": "Pick a different name.",
} as const;

/** A guest waiting for a quick match. */
interface QueueEntry {
	readonly guestId: string;
	readonly name: string;
	connection: Connection;
	readonly joinedAt: number;
}

interface Client {
	readonly id: string;
	readonly connection: Connection;
	readonly address: string;
	guestId: string | null;
	name: string;
	tokens: number;
	refilledAt: number;
}

/** A finished match with the account behind each signed-in seat. */
export interface MatchRecord extends Omit<MatchSummary, "players"> {
	readonly players: readonly (Omit<
		MatchSummary["players"][number],
		"guestId"
	> & {
		readonly userId: string | null;
	})[];
}

export interface HubDeps {
	readonly loadWords: () => Promise<WordList>;
	readonly randomId?: () => string;
	readonly now?: () => number;
	/** Randomness for bot decisions (tests pass a seeded one). */
	readonly botRandom?: () => number;
	/** The account id a login token belongs to, or null for a bad token. */
	readonly verifyToken?: (token: string) => Promise<string | null>;
	/** Saves a finished match that had at least one signed-in player. */
	readonly recordMatch?: (record: MatchRecord) => Promise<void>;
	readonly limits?: Partial<HubLimits>;
}

export class Hub {
	readonly rooms = new Map<string, Room>();
	private readonly clients = new Map<string, Client>();
	/** Which room each guest has a seat in. */
	private readonly guestRooms = new Map<string, string>();
	/** The account of each signed-in guest, from the token in their hello. */
	private readonly accounts = new Map<string, string>();
	/** Open sockets per network address. */
	private readonly addresses = new Map<string, number>();
	private readonly limits: HubLimits;
	private readonly roomAllowance = new RateLimiter();
	private words: Promise<WordList> | null = null;
	/** The word list once loaded, for work that can't wait (timers). */
	private loadedWords: WordList | null = null;
	private readonly queues: Record<MatchMode, QueueEntry[]> = {
		duel: [],
		siege: [],
	};
	private readonly queueTimers: Partial<
		Record<MatchMode, ReturnType<typeof setTimeout>>
	> = {};

	constructor(private readonly deps: HubDeps) {
		this.limits = { ...LIMITS, ...deps.limits };
	}

	private now(): number {
		return this.deps.now?.() ?? Date.now();
	}

	private loadWords(): Promise<WordList> {
		this.words ??= this.deps.loadWords().then(
			(words) => {
				this.loadedWords = words;
				return words;
			},
			(error: unknown) => {
				this.words = null;
				throw error;
			},
		);
		return this.words;
	}

	/**
	 * A new socket. Returns false (after telling the client why) when the server or the
	 * client's address already has too many; the caller then closes the socket.
	 */
	connect(
		id: string,
		send: (message: ServerMessage) => void,
		address = "unknown",
	): boolean {
		const fromAddress = this.addresses.get(address) ?? 0;
		const refusal: ErrorCode | null =
			this.clients.size >= this.limits.connections
				? "server-busy"
				: fromAddress >= this.limits.connectionsPerAddress
					? "too-many-connections"
					: null;
		if (refusal) {
			send({ type: "error", code: refusal, message: MESSAGES[refusal] });
			return false;
		}
		this.addresses.set(address, fromAddress + 1);
		this.clients.set(id, {
			id,
			connection: { send },
			address,
			guestId: null,
			name: "",
			tokens: BURST,
			refilledAt: this.now(),
		});
		return true;
	}

	disconnect(id: string): void {
		const client = this.clients.get(id);
		if (!client) return;
		this.clients.delete(id);
		const fromAddress = (this.addresses.get(client.address) ?? 1) - 1;
		if (fromAddress > 0) this.addresses.set(client.address, fromAddress);
		else this.addresses.delete(client.address);
		if (!client.guestId) return;
		this.roomOf(client.guestId)?.detach(client.guestId, client.connection);
		this.leaveQueue(client.guestId, client.connection);
		this.forgetAccount(client.guestId);
	}

	/** Records who a guest is signed in as. The check runs alongside the hello, not before it. */
	private identify(guestId: string, token: string | undefined): void {
		const verify = this.deps.verifyToken;
		if (!token || !verify) {
			this.accounts.delete(guestId);
			return;
		}
		void verify(token).then(
			(userId) => {
				if (userId) this.accounts.set(guestId, userId);
				else this.accounts.delete(guestId);
			},
			() => this.accounts.delete(guestId),
		);
	}

	/** Drops a guest's account once they're neither connected nor seated. */
	private forgetAccount(guestId: string): void {
		if (this.guestRooms.has(guestId)) return;
		for (const client of this.clients.values())
			if (client.guestId === guestId) return;
		this.accounts.delete(guestId);
	}

	/** Account id for a guest (tests and match history). */
	accountOf(guestId: string): string | null {
		return this.accounts.get(guestId) ?? null;
	}

	private matchFinished(summary: MatchSummary): void {
		const record: MatchRecord = {
			...summary,
			players: summary.players.map(({ guestId, ...player }) => ({
				...player,
				userId: guestId ? (this.accounts.get(guestId) ?? null) : null,
			})),
		};
		if (!this.deps.recordMatch) return;
		if (!record.players.some((player) => player.userId)) return;
		this.deps.recordMatch(record).catch((error: unknown) => {
			console.error("[bookwar] couldn't save a finished match", error);
		});
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
			this.identify(message.guestId, message.token);
			client.connection.send({ type: "welcome", serverNow: this.now() });
			this.roomOf(message.guestId)?.attach(message.guestId, client.connection);
			this.reattachQueue(message.guestId, client.connection);
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
				if (!Room.validSeconds(message.mode, message.seconds)) {
					this.fail(client, "bad-setting");
					return;
				}
				if (this.rooms.size >= this.limits.rooms) {
					this.fail(client, "server-busy");
					return;
				}
				const allowed = this.roomAllowance.take(
					guestId,
					1,
					this.limits.roomsPerMinute,
					60_000,
					this.now(),
				);
				if (!allowed) {
					this.fail(client, "rate-limited");
					return;
				}
				const words = await this.loadWords();
				this.leaveQueue(guestId);
				room?.leave(guestId);
				const created = this.openRoom(message.mode, message.seconds, words);
				this.guestRooms.set(guestId, created.code);
				created.join(guestId, client.name, client.connection);
				if (message.ai) {
					const count =
						message.mode === "duel"
							? 1
							: Math.min(message.ai.count, MODE_SEATS.siege - 1);
					for (let i = 0; i < count; i++)
						created.addBot(guestId, message.ai.difficulty);
					created.startCountdown();
				}
				return;
			}
			case "quickMatch": {
				if (this.rooms.size >= this.limits.rooms) {
					this.fail(client, "server-busy");
					return;
				}
				const words = await this.loadWords();
				room?.leave(guestId);
				this.leaveQueue(guestId);
				this.queues[message.mode].push({
					guestId,
					name: client.name,
					connection: client.connection,
					joinedAt: this.now(),
				});
				this.checkQueue(message.mode, words);
				return;
			}
			case "cancelQueue":
				this.leaveQueue(guestId);
				client.connection.send({ type: "queue", queue: null });
				return;
			case "joinRoom": {
				const target = this.rooms.get(message.code);
				if (!target) {
					this.fail(client, "room-not-found");
					return;
				}
				this.leaveQueue(guestId);
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
			case "setSeconds":
				return report(room.setSeconds(guestId, message.seconds));
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

	// --- Quick match ------------------------------------------------------------------------

	/**
	 * Starts matches from the queue when it can: a Duel as soon as two are waiting, a Siege
	 * when it's full or the first player has waited QUICK_WAIT_MS. Otherwise tells everyone
	 * where they stand and checks again when the wait is up.
	 */
	private checkQueue(mode: MatchMode, words: WordList): void {
		const queue = this.queues[mode];
		clearTimeout(this.queueTimers[mode]);
		delete this.queueTimers[mode];
		if (queue.length === 0) return;
		const capacity = MODE_SEATS[mode];
		const waited = this.now() - queue[0].joinedAt;
		const ready =
			queue.length >= capacity ||
			(queue.length >= 2 && (mode === "duel" || waited >= QUICK_WAIT_MS));
		if (ready) {
			this.startQuickMatch(mode, queue.splice(0, capacity), words);
			this.checkQueue(mode, words);
			return;
		}
		if (waited < QUICK_WAIT_MS) {
			this.queueTimers[mode] = setTimeout(
				() => this.checkQueue(mode, words),
				QUICK_WAIT_MS - waited,
			);
		}
		const startsAt =
			mode === "siege" && queue.length >= 2
				? queue[0].joinedAt + QUICK_WAIT_MS
				: null;
		for (const entry of queue) {
			entry.connection.send({
				type: "queue",
				queue: {
					mode,
					players: queue.length,
					startsAt,
					alone: queue.length === 1 && waited >= QUICK_WAIT_MS,
				},
			});
		}
	}

	private startQuickMatch(
		mode: MatchMode,
		entries: readonly QueueEntry[],
		words: WordList,
	): void {
		const room = this.openRoom(mode, DEFAULT_SECONDS[mode], words);
		for (const entry of entries) {
			entry.connection.send({ type: "queue", queue: null });
			this.guestRooms.set(entry.guestId, room.code);
			room.join(entry.guestId, entry.name, entry.connection);
		}
		room.startCountdown();
	}

	/** Takes a guest out of any queue (only if `connection` matches, when given). */
	private leaveQueue(guestId: string, connection?: Connection): void {
		for (const mode of Object.keys(this.queues) as MatchMode[]) {
			const queue = this.queues[mode];
			const index = queue.findIndex(
				(entry) =>
					entry.guestId === guestId &&
					(!connection || entry.connection === connection),
			);
			if (index === -1) continue;
			queue.splice(index, 1);
			if (this.loadedWords) this.checkQueue(mode, this.loadedWords);
		}
	}

	/** A queued guest reconnected: keep their place and tell them where they stand. */
	private reattachQueue(guestId: string, connection: Connection): void {
		for (const mode of Object.keys(this.queues) as MatchMode[]) {
			const entry = this.queues[mode].find((e) => e.guestId === guestId);
			if (!entry) continue;
			entry.connection = connection;
			if (this.loadedWords) this.checkQueue(mode, this.loadedWords);
		}
	}

	private openRoom(mode: MatchMode, seconds: number, words: WordList): Room {
		const room = new Room(this.newCode(), mode, seconds, this.roomDeps(words));
		this.rooms.set(room.code, room);
		return room;
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

	private roomDeps(words: WordList): RoomDeps {
		return {
			words,
			randomId: this.deps.randomId ?? randomUUID,
			now: this.deps.now,
			onSeatGone: (guestId: string, room: Room) => {
				if (this.guestRooms.get(guestId) === room.code)
					this.guestRooms.delete(guestId);
				this.forgetAccount(guestId);
			},
			onClose: (room: Room) => {
				this.rooms.delete(room.code);
			},
			startBot: (
				room: Room,
				seatId: string,
				difficulty: Parameters<typeof startBot>[2],
			) => startBot(room, seatId, difficulty, words, this.deps.botRandom),
			onFinished: (summary) => this.matchFinished(summary),
		};
	}
}
