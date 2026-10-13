import { CELL_COUNT, MIN_WORD_LETTERS } from "./config";
import { NEIGHBORS } from "./hex";
import { scoreWord } from "./scoring";
import { crystalTierFor } from "./specials";
import type { Board, CrystalTier, Stone, WordList } from "./types";

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
