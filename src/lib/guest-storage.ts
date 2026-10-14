// Saved games and high scores for players who aren't logged in, kept in localStorage.
// Everything read back is validated; anything unreadable is removed and treated as missing.
import { z } from "zod";
import {
	type GameMode,
	type GameState,
	MAX_MOVES,
	type MoveRecord,
	parseGameState,
} from "#/game";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PREFIX = "bookwar:v1";
const saveKey = (mode: GameMode) => `${PREFIX}:save:${mode}`;
const scoresKey = (mode: GameMode) => `${PREFIX}:scores:${mode}`;
const movesKey = (mode: GameMode) => `${PREFIX}:moves:${mode}`;
const uploadedKey = (userId: string) => `${PREFIX}:uploaded:${userId}`;

/** How many high scores are kept per mode. */
export const MAX_SCORES = 10;

/** localStorage, or null when the browser blocks it (private mode, disabled storage, SSR). */
function browserStorage(): StorageLike | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage;
	} catch {
		return null;
	}
}

function readJson(storage: StorageLike, key: string): unknown {
	try {
		const text = storage.getItem(key);
		return text === null ? undefined : JSON.parse(text);
	} catch {
		return null;
	}
}

function write(storage: StorageLike | null, key: string, value: unknown): void {
	try {
		storage?.setItem(key, JSON.stringify(value));
	} catch {
		// Full or blocked storage: the game still plays, it just isn't saved.
	}
}

function remove(storage: StorageLike | null, key: string): void {
	try {
		storage?.removeItem(key);
	} catch {
		// Nothing to do.
	}
}

/** The game in progress for a mode, if there is a valid one. */
export function loadSave(
	mode: GameMode,
	storage: StorageLike | null = browserStorage(),
): GameState | null {
	if (!storage) return null;
	const raw = readJson(storage, saveKey(mode));
	if (raw === undefined) return null;
	const state = parseGameState(raw);
	if (!state || state.mode !== mode || state.status !== "playing") {
		remove(storage, saveKey(mode));
		return null;
	}
	return state;
}

export function saveGame(
	state: GameState,
	storage: StorageLike | null = browserStorage(),
): void {
	write(storage, saveKey(state.mode), state);
}

export function clearSave(
	mode: GameMode,
	storage: StorageLike | null = browserStorage(),
): void {
	remove(storage, saveKey(mode));
	remove(storage, movesKey(mode));
}

const MovesSchema = z.object({
	seed: z.string(),
	moves: z.array(z.string().max(64)).max(MAX_MOVES),
});

/** Keeps the saved game's move log, so its score can be checked once it's over. */
export function saveMoves(
	mode: GameMode,
	seed: string,
	moves: readonly MoveRecord[],
	storage: StorageLike | null = browserStorage(),
): void {
	write(storage, movesKey(mode), { seed, moves });
}

/** The move log of the saved game with this seed, or null when there isn't a usable one. */
export function loadMoves(
	mode: GameMode,
	seed: string,
	storage: StorageLike | null = browserStorage(),
): MoveRecord[] | null {
	if (!storage) return null;
	const parsed = MovesSchema.safeParse(readJson(storage, movesKey(mode)));
	return parsed.success && parsed.data.seed === seed ? parsed.data.moves : null;
}

const ScoreEntrySchema = z.object({
	score: z.number().int().nonnegative(),
	level: z.number().int().min(1),
	words: z.number().int().nonnegative(),
	bestWord: z
		.object({ word: z.string(), score: z.number().int().nonnegative() })
		.nullable(),
	playedAt: z.iso.datetime(),
	seed: z.string(),
	/** Every move of the game, when it was logged: lets the leaderboard check the score. */
	moves: z.array(z.string().max(64)).max(MAX_MOVES).optional(),
});

export type ScoreEntry = z.infer<typeof ScoreEntrySchema>;

/** High scores for a mode, best first. */
export function loadScores(
	mode: GameMode,
	storage: StorageLike | null = browserStorage(),
): ScoreEntry[] {
	if (!storage) return [];
	const raw = readJson(storage, scoresKey(mode));
	if (raw === undefined) return [];
	const parsed = z.array(ScoreEntrySchema).safeParse(raw);
	if (!parsed.success) {
		remove(storage, scoresKey(mode));
		return [];
	}
	return sortScores(parsed.data).slice(0, MAX_SCORES);
}

/** Higher score first; on a tie, whoever got there first. */
function sortScores(entries: readonly ScoreEntry[]): ScoreEntry[] {
	return [...entries].sort(
		(a, b) => b.score - a.score || a.playedAt.localeCompare(b.playedAt),
	);
}

/** Adds a finished game. Returns its place on the list (1 = best), or null if it didn't make it. */
export function recordScore(
	mode: GameMode,
	entry: ScoreEntry,
	storage: StorageLike | null = browserStorage(),
): number | null {
	const scores = sortScores([...loadScores(mode, storage), entry]).slice(
		0,
		MAX_SCORES,
	);
	write(storage, scoresKey(mode), scores);
	const place = scores.indexOf(entry);
	return place === -1 ? null : place + 1;
}

/** The entry recordScore expects for a finished game. */
export function scoreEntryFor(
	state: GameState,
	playedAt: Date,
	moves?: readonly MoveRecord[],
): ScoreEntry {
	return {
		score: state.score,
		level: state.level,
		words: state.wordsPlayed,
		bestWord: state.bestWord,
		playedAt: playedAt.toISOString(),
		seed: state.seed,
		moves: moves ? [...moves] : undefined,
	};
}

// --- Sending local scores to an account ------------------------------------------------------

/** How many sent games each account remembers, so the list doesn't grow forever. */
const UPLOADED_KEEP = 200;
const gameKey = (mode: GameMode, seed: string) => `${mode}:${seed}`;

function loadUploaded(userId: string, storage: StorageLike): string[] {
	const parsed = z
		.array(z.string())
		.safeParse(readJson(storage, uploadedKey(userId)));
	return parsed.success ? parsed.data : [];
}

/** This browser's high scores that the account hasn't been sent yet. */
export function scoresToUpload(
	userId: string,
	modes: readonly GameMode[],
	storage: StorageLike | null = browserStorage(),
): { mode: GameMode; entry: ScoreEntry }[] {
	if (!storage) return [];
	const sent = new Set(loadUploaded(userId, storage));
	return modes.flatMap((mode) =>
		loadScores(mode, storage)
			.filter((entry) => !sent.has(gameKey(mode, entry.seed)))
			.map((entry) => ({ mode, entry })),
	);
}

/** Notes games the account now has, so they aren't sent again. */
export function markUploaded(
	userId: string,
	games: readonly { mode: GameMode; seed: string }[],
	storage: StorageLike | null = browserStorage(),
): void {
	if (!storage || games.length === 0) return;
	const sent = loadUploaded(userId, storage);
	const added = games.map((game) => gameKey(game.mode, game.seed));
	write(
		storage,
		uploadedKey(userId),
		[...new Set([...sent, ...added])].slice(-UPLOADED_KEEP),
	);
}
