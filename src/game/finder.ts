import { CELL_COUNT, MIN_WORD_LETTERS } from "./config";
import { NEIGHBORS } from "./hex";
import { scoreWord } from "./scoring";
import { crystalTierFor } from "./specials";
import type { Board, CrystalTier, Letter, Stone, WordList } from "./types";

export interface Candidate {
	readonly word: string;
	readonly path: readonly number[];
	readonly score: number;
	readonly cursesBroken: number;
	/** Crystal this word would leave behind. */
	readonly crystalTier: CrystalTier | null;
}

/**
 * Every playable word on the board, best-scoring path per word, highest score first.
 * Depth-first search over touching stones, pruned as soon as no word starts with the prefix.
 */
export function findWords(
	board: Board,
	words: WordList,
	options: { readonly maxLetters?: number } = {},
): Candidate[] {
	const maxLetters = options.maxLetters ?? 10;
	const best = new Map<string, Candidate>();
	const used = new Uint8Array(CELL_COUNT);
	const path: number[] = [];
	const stones: Stone[] = [];

	const visit = (index: number, prefix: string): void => {
		const stone = board[index];
		if (!stone || used[index]) return;
		const word = prefix + stone.letter;
		if (word.length > maxLetters || !words.hasPrefix(word)) return;

		used[index] = 1;
		path.push(index);
		stones.push(stone);

		if (word.length >= MIN_WORD_LETTERS && words.has(word)) {
			const score = scoreWord(stones).total;
			const previous = best.get(word);
			if (!previous || score > previous.score) {
				best.set(word, {
					word,
					path: [...path],
					score,
					cursesBroken: stones.filter((s) => s.kind === "curse").length,
					crystalTier: crystalTierFor(word.length),
				});
			}
		}
		for (const next of NEIGHBORS[index]) visit(next, word);

		used[index] = 0;
		path.pop();
		stones.pop();
	};

	for (let index = 0; index < CELL_COUNT; index++) visit(index, "");

	return [...best.values()].sort(
		(a, b) => b.score - a.score || (a.word < b.word ? -1 : 1),
	);
}

/** Search steps findPath may spend before giving up (protects against huge letter runs). */
const PATH_SEARCH_BUDGET = 50_000;

/**
 * A path of touching stones spelling `letters`, one entry per stone ("qu" is one entry), or
 * null. Keeps as much of `prefer` as still matches, so typing extends the current selection
 * instead of jumping elsewhere on the board.
 */
export function findPath(
	board: Board,
	letters: readonly Letter[],
	prefer: readonly number[] = [],
): number[] | null {
	let keep = 0;
	while (
		keep < prefer.length &&
		keep < letters.length &&
		board[prefer[keep]]?.letter === letters[keep]
	) {
		keep++;
	}
	const budget = { steps: PATH_SEARCH_BUDGET };
	for (let kept = keep; kept >= 0; kept--) {
		const path = extendPath(board, letters, prefer.slice(0, kept), budget);
		if (path) return path;
		if (budget.steps <= 0) return null;
	}
	return null;
}

function extendPath(
	board: Board,
	letters: readonly Letter[],
	start: readonly number[],
	budget: { steps: number },
): number[] | null {
	const used = new Uint8Array(CELL_COUNT);
	for (const index of start) used[index] = 1;
	const path = [...start];
	const everyCell = Array.from({ length: CELL_COUNT }, (_, index) => index);

	const visit = (from: number | undefined): boolean => {
		if (path.length === letters.length) return true;
		if (--budget.steps <= 0) return false;
		const want = letters[path.length];
		for (const index of from === undefined ? everyCell : NEIGHBORS[from]) {
			if (used[index] || board[index]?.letter !== want) continue;
			used[index] = 1;
			path.push(index);
			if (visit(index)) return true;
			used[index] = 0;
			path.pop();
		}
		return false;
	};

	return visit(path.at(-1)) ? path : null;
}
