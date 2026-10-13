import {
	LETTER_WEIGHTS,
	VOWEL_BALANCE_AFTER,
	VOWEL_SHARE_MAX,
	VOWEL_SHARE_MIN,
	VOWELS,
} from "./config";
import type { Rng } from "./rng";
import type { Board, Letter } from "./types";

const ALL_LETTERS = Object.keys(LETTER_WEIGHTS) as Letter[];
const VOWEL_LETTERS = ALL_LETTERS.filter((letter) => VOWELS.has(letter));
const CONSONANT_LETTERS = ALL_LETTERS.filter((letter) => !VOWELS.has(letter));

/**
 * Draws a letter for an empty cell, looking at what's already on the board: keeps the vowel
 * share between VOWEL_SHARE_MIN and VOWEL_SHARE_MAX and allows at most one Qu stone.
 */
export function drawLetter(rng: Rng, board: Board): Letter {
	let filled = 0;
	let vowels = 0;
	let hasQu = false;
	for (const cell of board) {
		if (!cell) continue;
		filled++;
		if (VOWELS.has(cell.letter)) vowels++;
		if (cell.letter === "qu") hasQu = true;
	}

	let pool = ALL_LETTERS;
	if (filled >= VOWEL_BALANCE_AFTER) {
		const share = vowels / filled;
		if (share < VOWEL_SHARE_MIN) pool = VOWEL_LETTERS;
		else if (share > VOWEL_SHARE_MAX) pool = CONSONANT_LETTERS;
	}
	if (hasQu) pool = pool.filter((letter) => letter !== "qu");

	const total = pool.reduce((sum, letter) => sum + LETTER_WEIGHTS[letter], 0);
	let roll = rng.next() * total;
	for (const letter of pool) {
		roll -= LETTER_WEIGHTS[letter];
		if (roll < 0) return letter;
	}
	return pool[pool.length - 1];
}
