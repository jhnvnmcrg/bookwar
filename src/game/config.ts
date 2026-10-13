// Every tuning number for the game lives here.
import type { CrystalTier, Letter } from "./types";

/** Board size. Odd columns sit half a cell lower than even ones. */
export const COLS = 7;
export const ROWS = 8;
export const CELL_COUNT = COLS * ROWS;

export const MIN_WORD_LETTERS = 3;

/** Draw weights, from letter frequencies in dictionary words. */
export const LETTER_WEIGHTS: Readonly<Record<Letter, number>> = {
	e: 112,
	a: 85,
	r: 76,
	i: 75,
	o: 72,
	t: 70,
	n: 67,
	s: 57,
	l: 55,
	c: 45,
	u: 36,
	d: 34,
	p: 32,
	m: 30,
	h: 30,
	g: 25,
	b: 21,
	f: 18,
	y: 18,
	w: 13,
	k: 11,
	v: 10,
	x: 3,
	z: 3,
	j: 2,
	qu: 2,
};

export const VOWELS: ReadonlySet<Letter> = new Set(["a", "e", "i", "o", "u"]);
/** Below/above these vowel shares the bag only draws vowels/consonants. */
export const VOWEL_SHARE_MIN = 0.3;
export const VOWEL_SHARE_MAX = 0.5;
/** Vowel balancing kicks in once this many stones are on the board. */
export const VOWEL_BALANCE_AFTER = 6;

export const LETTER_POINTS: Readonly<Record<Letter, number>> = {
	a: 1,
	e: 1,
	i: 1,
	o: 1,
	u: 1,
	l: 1,
	n: 1,
	r: 1,
	s: 1,
	t: 1,
	d: 2,
	g: 2,
	b: 3,
	c: 3,
	m: 3,
	p: 3,
	f: 4,
	h: 4,
	v: 4,
	w: 4,
	y: 4,
	k: 5,
	j: 8,
	x: 8,
	qu: 10,
	z: 10,
};

/** Multiplier for words of 3, 4, 5, 6, 7 and 8 letters. */
export const LENGTH_MULTIPLIERS = [1, 1.5, 2, 2.5, 3, 4] as const;
/** Added for every letter past the end of LENGTH_MULTIPLIERS. */
export const LENGTH_MULTIPLIER_STEP = 1;
/** Raw points are scaled up so scores feel big. */
export const SCORE_SCALE = 10;

export interface CrystalSpec {
	readonly tier: CrystalTier;
	readonly name: string;
	readonly minLetters: number;
	readonly multiplier: number;
}

/** Highest tier first. */
export const CRYSTALS: readonly CrystalSpec[] = [
	{ tier: 4, name: "diamond", minLetters: 8, multiplier: 3 },
	{ tier: 3, name: "ruby", minLetters: 7, multiplier: 2.5 },
	{ tier: 2, name: "sapphire", minLetters: 6, multiplier: 2 },
	{ tier: 1, name: "emerald", minLetters: 5, multiplier: 1.5 },
];
export const MAX_CRYSTAL_MULTIPLIER = 6;

/** Chance that a word brings a curse rune: base + per level (capped) + short-word penalty. */
export const CURSE_BASE_CHANCE = 0.03;
export const CURSE_CHANCE_PER_LEVEL = 0.01;
export const CURSE_MAX_BASE_CHANCE = 0.15;
export const CURSE_SHORT_WORD_CHANCE: Readonly<Record<number, number>> = {
	3: 0.12,
	4: 0.05,
};
/** Words never add a curse past this many; the shuffle spell still does. */
export const MAX_CURSES_FROM_WORDS = 3;

/** Score needed for level 2, and how much more each later level needs. */
export const LEVEL_FIRST_STEP = 1000;
export const LEVEL_STEP_GROWTH = 500;

export const RANKS = [
	"Apprentice",
	"Initiate",
	"Adept",
	"Conjurer",
	"Mage",
	"Sorcerer",
	"Enchanter",
	"Archmage",
	"Grand Archmage",
] as const;

export const PROPHECY_BONUS_BASE = 500;
export const PROPHECY_BONUS_PER_LEVEL = 250;

/** Action mode starts with this many bottom rows filled in every column. */
export const ACTION_START_ROWS = 4;
/** Time between dropped stones at level 1, how much faster each level gets, and the floor. */
export const ACTION_DROP_START_MS = 2400;
export const ACTION_DROP_SPEEDUP = 0.9;
export const ACTION_DROP_MIN_MS = 700;
/** In Action mode the shuffle spell costs this many extra stones instead of a curse. */
export const ACTION_SHUFFLE_DROPS = 3;
