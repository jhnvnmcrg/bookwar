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

export const PROTOCOL_VERSION = 1;
export const WS_PATH = "/api/ws";

/** Duel lengths players can pick, in seconds. */
export const DUEL_DURATIONS = [120, 180, 300] as const;
export type DuelDuration = (typeof DUEL_DURATIONS)[number];
export const DEFAULT_DUEL_SECONDS: DuelDuration = 180;
export const COUNTDOWN_MS = 3000;
/** How long a disconnected player keeps their seat. */
export const RECONNECT_GRACE_MS = 20_000;
export const MAX_MESSAGE_BYTES = 4096;

export const BOT_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];

const ROOM_CODE = /^[A-HJ-NP-Z2-9]{5}$/;
const durationSec = z.union(
	DUEL_DURATIONS.map((d) => z.literal(d)) as [
		z.ZodLiteral<120>,
		z.ZodLiteral<180>,
		z.ZodLiteral<300>,
	],
);
const seq = z.number().int().nonnegative();

export const ClientMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("hello"),
		v: z.literal(PROTOCOL_VERSION),
		guestId: z.string().min(16).max(64),
		nickname: z.string().max(40),
	}),
	z.object({
		type: z.literal("createRoom"),
		durationSec,
		/** Seat an AI rival straight away and start the match. */
		bot: z.enum(BOT_DIFFICULTIES).optional(),
	}),
	z.object({ type: z.literal("joinRoom"), code: z.string().regex(ROOM_CODE) }),
	z.object({ type: z.literal("leaveRoom") }),
	z.object({ type: z.literal("addBot"), difficulty: z.enum(BOT_DIFFICULTIES) }),
	z.object({ type: z.literal("removeSeat"), seatId: z.string().max(32) }),
	z.object({ type: z.literal("setDuration"), durationSec }),
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

export type RoomPhase = "waiting" | "countdown" | "playing" | "finished";
export type OutReason = "tower" | "left";
export type EndReason = "time" | "tower" | "left";

export interface SeatView {
	readonly seatId: string;
	readonly name: string;
	readonly bot: BotDifficulty | null;
	readonly host: boolean;
	readonly connected: boolean;
	readonly score: number;
	readonly out: OutReason | null;
}

export interface MatchResult {
	/** null when the duel is a draw. */
	readonly winnerSeatId: string | null;
	readonly reason: EndReason;
	readonly standings: readonly {
		readonly seatId: string;
		readonly name: string;
		readonly score: number;
		readonly place: number;
	}[];
}

export interface RoomView {
	readonly code: string;
	readonly mode: "duel";
	readonly phase: RoomPhase;
	readonly durationSec: number;
	/** Server time (ms) when the countdown or match ends. */
	readonly phaseEndsAt: number | null;
	readonly seats: readonly SeatView[];
	/** The receiving player's seat. */
	readonly you: string | null;
	readonly result: MatchResult | null;
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
