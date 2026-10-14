// Messages between the browser and the game server over the WebSocket at /api/ws.
// Client messages are validated with zod on the server; server messages are trusted types.
import { z } from "zod";
import { CELL_COUNT } from "../game/config";
import type {
	Board,
	Cell,
	CrystalTier,
	GameEvent,
	GameState,
	Letter,
	PlayError,
} from "../game/types";

export const PROTOCOL_VERSION = 2;
export const WS_PATH = "/api/ws";

export const MATCH_MODES = ["duel", "siege"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

/** Seats per room. */
export const MODE_SEATS: Record<MatchMode, number> = { duel: 2, siege: 5 };

/**
 * The time players can pick, in seconds: the whole match for a Duel, each round for a Siege.
 */
export const MODE_SECONDS = {
	duel: [120, 180, 300],
	siege: [30, 60, 90],
} as const satisfies Record<MatchMode, readonly number[]>;
export const DEFAULT_SECONDS: Record<MatchMode, number> = {
	duel: 180,
	siege: 60,
};

export const COUNTDOWN_MS = 3000;
/** Siege: the pause after each round's cut before the next round starts. */
export const ROUND_BREAK_MS = 5000;
/** Quick match: how long to wait for more players before starting with whoever is there. */
export const QUICK_WAIT_MS = 30_000;
/** How long a disconnected player keeps their seat. */
export const RECONNECT_GRACE_MS = 20_000;
/** Biggest message a client may send; a hello carrying a login token is the largest. */
export const MAX_MESSAGE_BYTES = 8192;

export const BOT_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];

const ROOM_CODE = /^[A-HJ-NP-Z2-9]{5}$/;
const seq = z.number().int().nonnegative();
const seconds = z.number().int().min(10).max(600);

export const ClientMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("hello"),
		v: z.literal(PROTOCOL_VERSION),
		guestId: z.string().min(16).max(64),
		nickname: z.string().max(40),
		/** Signed-in players: their login token, so finished matches go in their history. */
		token: z.string().max(6000).optional(),
	}),
	z.object({
		type: z.literal("createRoom"),
		mode: z.enum(MATCH_MODES),
		seconds,
		/** Fill the other seats with AI rivals straight away and start the match. */
		ai: z
			.object({
				difficulty: z.enum(BOT_DIFFICULTIES),
				count: z.number().int().min(1).max(4),
			})
			.optional(),
	}),
	z.object({ type: z.literal("joinRoom"), code: z.string().regex(ROOM_CODE) }),
	z.object({ type: z.literal("leaveRoom") }),
	z.object({ type: z.literal("quickMatch"), mode: z.enum(MATCH_MODES) }),
	z.object({ type: z.literal("cancelQueue") }),
	z.object({ type: z.literal("addBot"), difficulty: z.enum(BOT_DIFFICULTIES) }),
	z.object({ type: z.literal("removeSeat"), seatId: z.string().max(32) }),
	z.object({ type: z.literal("setSeconds"), seconds }),
	z.object({ type: z.literal("start") }),
	z.object({
		type: z.literal("play"),
		seq,
		path: z.array(z.number().int()).min(1).max(CELL_COUNT),
	}),
	z.object({ type: z.literal("shuffle"), seq }),
	z.object({ type: z.literal("rematch") }),
	z.object({ type: z.literal("ping"), t: z.number() }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Siege adds a short "roundEnd" break between rounds. */
export type RoomPhase =
	| "waiting"
	| "countdown"
	| "playing"
	| "roundEnd"
	| "finished";
/** "cut": lowest score at the end of a Siege round. */
export type OutReason = "tower" | "left" | "cut";
/** "last-standing": a Siege ended with one wizard left. */
export type EndReason = "time" | "tower" | "left" | "last-standing";

export interface SeatView {
	readonly seatId: string;
	readonly name: string;
	readonly bot: BotDifficulty | null;
	readonly host: boolean;
	readonly connected: boolean;
	readonly score: number;
	readonly out: OutReason | null;
	/** The Siege round they went out in. */
	readonly outRound: number | null;
}

export interface Standing {
	readonly seatId: string;
	readonly name: string;
	readonly score: number;
	readonly place: number;
	readonly out: OutReason | null;
	readonly outRound: number | null;
}

export interface MatchResult {
	/** null when a duel is a draw. */
	readonly winnerSeatId: string | null;
	readonly reason: EndReason;
	readonly standings: readonly Standing[];
}

export interface RoomView {
	readonly code: string;
	readonly mode: MatchMode;
	readonly phase: RoomPhase;
	/** Duel: match length. Siege: round length. */
	readonly seconds: number;
	/** Siege: the current round (from 1), or 0 before the match. */
	readonly round: number;
	/** Server time (ms) when the countdown, match, round or break ends. */
	readonly phaseEndsAt: number | null;
	readonly seats: readonly SeatView[];
	/** The receiving player's seat. */
	readonly you: string | null;
	/** Siege: who was cut at the end of the last round. */
	readonly cut: { readonly seatId: string; readonly round: number } | null;
	readonly result: MatchResult | null;
}

/** Where this player stands in a quick-match queue. */
export interface QueueView {
	readonly mode: MatchMode;
	/** Players waiting, including you. */
	readonly players: number;
	/** When the match will start with whoever is there (server time), if known. */
	readonly startsAt: number | null;
	/** Nobody else turned up in time: the page offers a game against the AI. */
	readonly alone: boolean;
}

/** A player's game without the parts that would let them predict future stones. */
export type PublicGameState = Omit<
	GameState,
	"seed" | "rng" | "nextId" | "pastProphecies"
>;

export function toPublicState(state: GameState): PublicGameState {
	return {
		version: state.version,
		mode: state.mode,
		board: state.board,
		score: state.score,
		level: state.level,
		wordsPlayed: state.wordsPlayed,
		prophecy: state.prophecy,
		bestWord: state.bestWord,
		status: state.status,
	};
}

export type MoveError = PlayError | "not-playing";

export type ErrorCode =
	| "bad-message"
	| "say-hello-first"
	| "old-version"
	| "name-not-allowed"
	| "room-not-found"
	| "room-full"
	| "match-running"
	| "not-host"
	| "not-in-room"
	| "need-two-players"
	| "bad-setting"
	| "rate-limited";

export type ServerMessage =
	| { readonly type: "welcome"; readonly serverNow: number }
	| {
			readonly type: "room";
			readonly room: RoomView;
			readonly serverNow: number;
	  }
	/** You are no longer in the room (you left, or it closed). */
	| { readonly type: "left" }
	/** Your quick-match queue status; null once you're out of the queue. */
	| { readonly type: "queue"; readonly queue: QueueView | null }
	/** Your board: at match start, after reconnecting (seq null), or after your move. */
	| {
			readonly type: "board";
			readonly seq: number | null;
			readonly ok: boolean;
			readonly error: MoveError | null;
			readonly state: PublicGameState;
			readonly events: readonly GameEvent[];
	  }
	/** An opponent's board in compact form, after each of their moves. */
	| {
			readonly type: "opponent";
			readonly seatId: string;
			readonly mini: string;
	  }
	| {
			readonly type: "error";
			readonly code: ErrorCode;
			readonly message: string;
	  }
	| { readonly type: "pong"; readonly t: number; readonly serverNow: number };

/**
 * Compact board for opponents: one comma-separated token per cell. "" empty, "!a" curse,
 * "a2" crystal of tier 2, "a" plain rune.
 */
export function encodeMini(board: Board): string {
	return board
		.map((cell) =>
			!cell
				? ""
				: cell.kind === "curse"
					? `!${cell.letter}`
					: cell.kind === "crystal"
						? `${cell.letter}${cell.tier}`
						: cell.letter,
		)
		.join(",");
}

export function decodeMini(mini: string): Board {
	return mini.split(",").map((token, index): Cell => {
		const match = /^(!?)([a-z]+?)([1-4]?)$/.exec(token);
		if (!match) return null;
		const [, curse, letter, tier] = match;
		const base = { id: index, letter: letter as Letter };
		if (curse) return { ...base, kind: "curse" };
		if (tier)
			return { ...base, kind: "crystal", tier: Number(tier) as CrystalTier };
		return { ...base, kind: "rune" };
	});
}
