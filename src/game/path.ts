import { CELL_COUNT, MIN_WORD_LETTERS } from "./config";
import { areAdjacent } from "./hex";
import type { Board, PlayError, Stone, WordList } from "./types";

export type PathCheck =
	| {
			readonly ok: true;
			readonly word: string;
			readonly stones: readonly Stone[];
	  }
	| { readonly ok: false; readonly error: PlayError };

/**
 * A path is a list of cell indexes. It must touch stone to stone, never reuse one, spell at
 * least MIN_WORD_LETTERS letters ("qu" counts as two) and be in the word list.
 */
export function checkPath(
	board: Board,
	path: readonly number[],
	words: WordList,
): PathCheck {
	if (!Array.isArray(path) || path.length === 0)
		return { ok: false, error: "bad-path" };

	const seen = new Set<number>();
	const stones: Stone[] = [];
	for (let i = 0; i < path.length; i++) {
		const index = path[i];
		if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT) {
			return { ok: false, error: "bad-path" };
		}
		const stone = board[index];
		if (!stone) return { ok: false, error: "bad-path" };
		if (seen.has(index)) return { ok: false, error: "reused-stone" };
		if (i > 0 && !areAdjacent(path[i - 1], index)) {
			return { ok: false, error: "not-adjacent" };
		}
		seen.add(index);
		stones.push(stone);
	}

	const word = stones.map((stone) => stone.letter).join("");
	if (word.length < MIN_WORD_LETTERS) return { ok: false, error: "too-short" };
	if (!words.has(word)) return { ok: false, error: "not-a-word" };
	return { ok: true, word, stones };
}
