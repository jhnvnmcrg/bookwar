// A solo game's move log, so a finished game can be played again from its seed and its score
// checked. The engine is deterministic: the same seed and the same moves always give the
// same board, score and ending.
import { CELL_COUNT } from "./config";
import { createGame, reduce } from "./reducer";
import type {
	GameAction,
	GameMode,
	GameState,
	PlayError,
	WordList,
} from "./types";

/**
 * One move as stored in the log: "t" a falling stone (Action), "s" the shuffle spell, or a
 * word as one character per stone, in order.
 */
export type MoveRecord = string;

/** Longest log the server will replay (an Action game drops a stone every second or so). */
export const MAX_MOVES = 10_000;

/** One character per board cell; 62 characters cover the 56 cells. */
const CELL_CHARS =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function encodeMove(action: GameAction): MoveRecord {
	switch (action.type) {
		case "tick":
			return "t";
		case "shuffle":
			return "s";
		case "play":
			return action.path.map((cell) => CELL_CHARS[cell]).join("");
	}
}

/** The action a log entry stands for, or null when it isn't a valid entry. */
export function decodeMove(move: MoveRecord): GameAction | null {
	if (move === "t") return { type: "tick" };
	if (move === "s") return { type: "shuffle" };
	// Every word uses at least two stones ("Qu" counts as two letters).
	if (move.length < 2 || move.length > CELL_COUNT) return null;
	const path: number[] = [];
	for (const char of move) {
		const cell = CELL_CHARS.indexOf(char);
		if (cell === -1 || cell >= CELL_COUNT) return null;
		path.push(cell);
	}
	return { type: "play", path };
}

export type ReplayResult =
	| { readonly ok: true; readonly state: GameState }
	| {
			readonly ok: false;
			/** Index of the move that failed, or -1 when the log as a whole was rejected. */
			readonly at: number;
			readonly error: PlayError | "bad-move" | "too-long";
	  };

/** Plays a game again from its seed. Every move must be legal, in order. */
export function replayGame(
	mode: GameMode,
	seed: string,
	moves: readonly MoveRecord[],
	words: WordList,
): ReplayResult {
	if (moves.length > MAX_MOVES) return { ok: false, at: -1, error: "too-long" };
	let state = createGame({ mode, seed });
	for (const [at, move] of moves.entries()) {
		const action = decodeMove(move);
		if (!action) return { ok: false, at, error: "bad-move" };
		const result = reduce(state, action, words);
		if (!result.ok) return { ok: false, at, error: result.error };
		state = result.state;
	}
	return { ok: true, state };
}
