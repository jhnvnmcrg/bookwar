// What the browser and the server exchange about accounts, scores and leaderboards.
import { z } from "zod";
import { MAX_MOVES } from "../game/replay";

export const SOLO_BOARD_MODES = ["classic", "action"] as const;
export type SoloBoardMode = (typeof SOLO_BOARD_MODES)[number];

/** A finished Solo game sent to the server, from the game-over screen or a guest's list. */
export const ScoreUploadSchema = z.object({
	mode: z.enum(SOLO_BOARD_MODES),
	seed: z.string().min(1).max(64),
	/** The game's moves; without them the score can't be checked (older local scores). */
	moves: z.array(z.string().max(64)).max(MAX_MOVES).optional(),
	score: z.number().int().nonnegative().max(100_000_000),
	level: z.number().int().min(1).max(1000),
	words: z.number().int().nonnegative().max(MAX_MOVES),
	bestWord: z
		.object({
			word: z.string().max(32),
			score: z.number().int().nonnegative(),
		})
		.nullable(),
	playedAt: z.iso.datetime(),
});
export type ScoreUpload = z.infer<typeof ScoreUploadSchema>;

/** How many local scores one import may carry (ten per mode). */
export const MAX_IMPORT = 20;

export interface SubmitResult {
	/** The score the server got by replaying the game. */
	readonly score: number;
	/** Place among all players on that mode's leaderboard. */
	readonly place: number;
}

export interface LeaderRow {
	readonly place: number;
	readonly nickname: string;
	readonly score: number;
	readonly level: number;
	readonly bestWord: string | null;
	readonly playedAt: string;
}

export interface WinsRow {
	readonly place: number;
	readonly nickname: string;
	readonly wins: number;
	readonly played: number;
}

export interface Leaderboard {
	readonly classic: readonly LeaderRow[];
	readonly action: readonly LeaderRow[];
	readonly duel: readonly WinsRow[];
	readonly siege: readonly WinsRow[];
}

export interface MyScore {
	readonly mode: SoloBoardMode;
	readonly score: number;
	readonly level: number;
	readonly bestWord: string | null;
	readonly verified: boolean;
	readonly playedAt: string;
}

export interface MyMatch {
	readonly id: string;
	readonly mode: "duel" | "siege";
	readonly place: number;
	readonly won: boolean;
	/** Everyone at the table drew (a Duel tie). */
	readonly draw: boolean;
	readonly score: number;
	readonly rivals: readonly string[];
	readonly vsAi: boolean;
	readonly endedAt: string;
}

export interface MyRecord {
	readonly played: number;
	readonly won: number;
}

export interface AccountView {
	readonly nickname: string;
	readonly scores: readonly MyScore[];
	readonly record: { readonly duel: MyRecord; readonly siege: MyRecord };
	readonly matches: readonly MyMatch[];
}
