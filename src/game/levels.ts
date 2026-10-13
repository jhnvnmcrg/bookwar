import {
	LEVEL_FIRST_STEP,
	LEVEL_STEP_GROWTH,
	PROPHECY_BONUS_BASE,
	PROPHECY_BONUS_PER_LEVEL,
	RANKS,
} from "./config";
import { PROPHECY_WORDS } from "./dictionary/prophecy-words";
import type { Rng } from "./rng";

/** Total score needed to reach a level. Level 1 starts at 0; each step grows by LEVEL_STEP_GROWTH. */
export function scoreForLevel(level: number): number {
	const steps = level - 1;
	return (
		steps * LEVEL_FIRST_STEP + (LEVEL_STEP_GROWTH * steps * (steps - 1)) / 2
	);
}

export function levelForScore(score: number): number {
	let level = 1;
	while (score >= scoreForLevel(level + 1)) level++;
	return level;
}

export function rankFor(level: number): string {
	return RANKS[Math.min(level, RANKS.length) - 1];
}

export function prophecyBonus(level: number): number {
	return PROPHECY_BONUS_BASE + PROPHECY_BONUS_PER_LEVEL * level;
}

/** A prophecy word not used yet this game (starts over once all are used). */
export function pickProphecy(rng: Rng, past: readonly string[]): string {
	const used = new Set(past);
	const fresh = PROPHECY_WORDS.filter((word) => !used.has(word));
	return rng.pick(fresh.length > 0 ? fresh : PROPHECY_WORDS);
}
