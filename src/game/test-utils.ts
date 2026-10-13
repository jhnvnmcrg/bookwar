// Helpers for engine tests: draw a board as text instead of building cells by hand.
import { COLS, ROWS } from "./config";
import { createGame } from "./reducer";
import type { Board, Cell, CrystalTier, GameState, Letter } from "./types";

/**
 * One string per row, top row first, one space-separated token per column.
 * Token: a letter ("qu" allowed), "!" prefix = curse, trailing 1–4 = crystal tier.
 * Example row: "c a t !e qu s2 e"
 */
export function boardFromRows(rows: readonly string[]): Board {
	if (rows.length !== ROWS) throw new Error(`need ${ROWS} rows`);
	const board: Cell[] = Array.from({ length: COLS * ROWS }, () => null);
	rows.forEach((line, row) => {
		const tokens = line.trim().split(/\s+/);
		if (tokens.length !== COLS)
			throw new Error(`row ${row} needs ${COLS} tokens`);
		tokens.forEach((token, col) => {
			const match = /^(!?)([a-z]+?)([1-4]?)$/.exec(token);
			if (!match) throw new Error(`bad token "${token}"`);
			const [, curse, letter, tier] = match;
			const index = col * ROWS + row;
			const id = index + 1;
			const l = letter as Letter;
			board[index] = curse
				? { id, letter: l, kind: "curse" }
				: tier
					? {
							id,
							letter: l,
							kind: "crystal",
							tier: Number(tier) as CrystalTier,
						}
					: { id, letter: l, kind: "rune" };
		});
	});
	return board;
}

/** A fresh Classic game with the given board swapped in. */
export function classicWith(
	board: Board,
	overrides: Partial<GameState> = {},
): GameState {
	return {
		...createGame({ mode: "classic", seed: "test" }),
		board,
		nextId: 1000,
		...overrides,
	};
}

/** Cell indexes for [col, row] pairs. */
export function cells(...coords: readonly [number, number][]): number[] {
	return coords.map(([col, row]) => col * ROWS + row);
}

/** A straight path down one column. */
export function down(col: number, fromRow: number, length: number): number[] {
	return Array.from({ length }, (_, i) => col * ROWS + fromRow + i);
}

/** Recursively freezes a value so tests catch accidental mutation. */
export function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) deepFreeze(child);
	}
	return value;
}
