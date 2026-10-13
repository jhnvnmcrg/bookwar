import {
	LENGTH_MULTIPLIER_STEP,
	LENGTH_MULTIPLIERS,
	LETTER_POINTS,
	MAX_CRYSTAL_MULTIPLIER,
	MIN_WORD_LETTERS,
	SCORE_SCALE,
} from "./config";
import { crystalSpec } from "./specials";
import type { Stone } from "./types";

export function lengthMultiplier(letters: number): number {
	if (letters < MIN_WORD_LETTERS) return 0;
	const step = letters - MIN_WORD_LETTERS;
	if (step < LENGTH_MULTIPLIERS.length) return LENGTH_MULTIPLIERS[step];
	const last = LENGTH_MULTIPLIERS[LENGTH_MULTIPLIERS.length - 1];
	return last + (step - LENGTH_MULTIPLIERS.length + 1) * LENGTH_MULTIPLIER_STEP;
}

/** Crystals in a word multiply together, capped at MAX_CRYSTAL_MULTIPLIER. */
export function crystalMultiplier(stones: readonly Stone[]): number {
	let multiplier = 1;
	for (const stone of stones) {
		if (stone.kind === "crystal")
			multiplier *= crystalSpec(stone.tier).multiplier;
	}
	return Math.min(multiplier, MAX_CRYSTAL_MULTIPLIER);
}

export interface WordScore {
	readonly letterPoints: number;
	readonly lengthMultiplier: number;
	readonly crystalMultiplier: number;
	readonly total: number;
}

export function scoreWord(stones: readonly Stone[]): WordScore {
	let points = 0;
	let letters = 0;
	for (const stone of stones) {
		points += LETTER_POINTS[stone.letter];
		letters += stone.letter.length;
	}
	const length = lengthMultiplier(letters);
	const crystal = crystalMultiplier(stones);
	return {
		letterPoints: points,
		lengthMultiplier: length,
		crystalMultiplier: crystal,
		total: Math.round(points * length * crystal * SCORE_SCALE),
	};
}
