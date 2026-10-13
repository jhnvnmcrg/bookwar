import {
	CRYSTALS,
	type CrystalSpec,
	CURSE_BASE_CHANCE,
	CURSE_CHANCE_PER_LEVEL,
	CURSE_MAX_BASE_CHANCE,
	CURSE_SHORT_WORD_CHANCE,
} from "./config";
import type { CrystalTier } from "./types";

export function crystalSpec(tier: CrystalTier): CrystalSpec {
	const spec = CRYSTALS.find((crystal) => crystal.tier === tier);
	if (!spec) throw new Error(`Unknown crystal tier ${tier}`);
	return spec;
}

/** The crystal a word of this many letters leaves behind, if any. */
export function crystalTierFor(letters: number): CrystalTier | null {
	return (
		CRYSTALS.find((crystal) => letters >= crystal.minLetters)?.tier ?? null
	);
}

export function higherTier(a: CrystalTier, b: CrystalTier): CrystalTier {
	return a > b ? a : b;
}

/** Chance that playing a word of this length at this level brings a new curse rune. */
export function curseChance(level: number, letters: number): number {
	const base = Math.min(
		CURSE_BASE_CHANCE + CURSE_CHANCE_PER_LEVEL * (level - 1),
		CURSE_MAX_BASE_CHANCE,
	);
	return base + (CURSE_SHORT_WORD_CHANCE[letters] ?? 0);
}
