/** A rune stone's letter. "qu" is one stone that counts as two letters. */
export type Letter =
	| "a"
	| "b"
	| "c"
	| "d"
	| "e"
	| "f"
	| "g"
	| "h"
	| "i"
	| "j"
	| "k"
	| "l"
	| "m"
	| "n"
	| "o"
	| "p"
	| "qu"
	| "r"
	| "s"
	| "t"
	| "u"
	| "v"
	| "w"
	| "x"
	| "y"
	| "z";

/** 1 emerald, 2 sapphire, 3 ruby, 4 diamond. */
export type CrystalTier = 1 | 2 | 3 | 4;

export type Stone =
	| { readonly id: number; readonly letter: Letter; readonly kind: "rune" }
	| { readonly id: number; readonly letter: Letter; readonly kind: "curse" }
	| {
			readonly id: number;
			readonly letter: Letter;
			readonly kind: "crystal";
			readonly tier: CrystalTier;
	  };

export type Cell = Stone | null;

/** Column-major: index = col * ROWS + row, row 0 at the top. */
export type Board = readonly Cell[];

export type RngState = readonly [number, number, number, number];

export type GameMode = "classic" | "action";

export type GameStatus = "playing" | "over";

export interface Prophecy {
	readonly word: string;
	readonly fulfilled: boolean;
}

export interface BestWord {
	readonly word: string;
	readonly score: number;
}

/** Plain JSON so it can be saved, sent over the wire and replayed. */
export interface GameState {
	readonly version: 1;
	readonly mode: GameMode;
	readonly seed: string;
	readonly rng: RngState;
	readonly nextId: number;
	readonly board: Board;
	readonly score: number;
	readonly level: number;
	readonly wordsPlayed: number;
	readonly prophecy: Prophecy;
	readonly pastProphecies: readonly string[];
	readonly bestWord: BestWord | null;
	readonly status: GameStatus;
}

export type GameAction =
	| { readonly type: "play"; readonly path: readonly number[] }
	| { readonly type: "shuffle" }
	/** Action mode: the clock drops one more stone. */
	| { readonly type: "tick" };

export type PlayError =
	| "game-over"
	| "wrong-mode"
	| "bad-path"
	| "reused-stone"
	| "not-adjacent"
	| "too-short"
	| "not-a-word";

export type GameEvent =
	| {
			readonly type: "word";
			readonly word: string;
			readonly path: readonly number[];
			readonly score: number;
			readonly crystalMultiplier: number;
			readonly cursesBroken: number;
	  }
	| {
			readonly type: "prophecy-fulfilled";
			readonly word: string;
			readonly bonus: number;
	  }
	| {
			readonly type: "level-up";
			readonly level: number;
			readonly rank: string;
			readonly prophecy: string;
	  }
	| {
			readonly type: "crystal-formed";
			readonly id: number;
			readonly tier: CrystalTier;
	  }
	| { readonly type: "curse-appeared"; readonly id: number }
	| { readonly type: "curses-sank"; readonly ids: readonly number[] }
	| { readonly type: "shuffled" }
	| { readonly type: "tower-fell" }
	| { readonly type: "stones-dropped"; readonly ids: readonly number[] }
	/** Action mode: a stone had nowhere to land. */
	| { readonly type: "buried" };

export type ReduceResult =
	| {
			readonly ok: true;
			readonly state: GameState;
			readonly events: readonly GameEvent[];
	  }
	| { readonly ok: false; readonly error: PlayError };

/** What the engine needs from a dictionary. */
export interface WordList {
	has(word: string): boolean;
	hasPrefix(prefix: string): boolean;
}
