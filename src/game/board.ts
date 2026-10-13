import { drawLetter } from "./bag";
import { CELL_COUNT, COLS, ROWS } from "./config";
import { toIndex } from "./hex";
import type { Rng } from "./rng";
import type { Board, Cell, CrystalTier, Letter, Stone } from "./types";

export function createBoard(
	rng: Rng,
	firstId: number,
): { board: Board; nextId: number } {
	const board: Cell[] = Array.from({ length: CELL_COUNT }, () => null);
	let nextId = firstId;
	for (let index = 0; index < CELL_COUNT; index++) {
		board[index] = {
			id: nextId++,
			letter: drawLetter(rng, board),
			kind: "rune",
		};
	}
	return { board, nextId };
}

/** Action mode's starting board: only the bottom `rows` of every column are filled. */
export function createPartialBoard(
	rng: Rng,
	firstId: number,
	rows: number,
): { board: Board; nextId: number } {
	const board: Cell[] = Array.from({ length: CELL_COUNT }, () => null);
	let nextId = firstId;
	for (let col = 0; col < COLS; col++) {
		for (let row = ROWS - 1; row >= ROWS - rows; row--) {
			board[toIndex(col, row)] = {
				id: nextId++,
				letter: drawLetter(rng, board),
				kind: "rune",
			};
		}
	}
	return { board, nextId };
}

export function removeStones(board: Board, indexes: readonly number[]): Board {
	const next = board.slice();
	for (const index of indexes) next[index] = null;
	return next;
}

/** Stones fall straight down their column, leaving any empty cells at the top. */
export function collapse(board: Board): Board {
	const next: Cell[] = board.slice();
	for (let col = 0; col < COLS; col++) {
		const stones: Stone[] = [];
		for (let row = ROWS - 1; row >= 0; row--) {
			const cell = next[toIndex(col, row)];
			if (cell) stones.push(cell);
		}
		for (let i = 0; i < ROWS; i++) {
			next[toIndex(col, ROWS - 1 - i)] = i < stones.length ? stones[i] : null;
		}
	}
	return next;
}

/** The lowest empty cell in a column (where a dropped stone lands), or null if it's full. */
export function landingCell(board: Board, col: number): number | null {
	for (let row = ROWS - 1; row >= 0; row--) {
		const index = toIndex(col, row);
		if (!board[index]) return index;
	}
	return null;
}

/**
 * Drops one stone onto a column (a random one with room unless `col` is given). Returns null
 * when it has nowhere to land.
 */
export function dropStone(
	board: Board,
	rng: Rng,
	stone: (letter: Letter) => Stone,
	col?: number,
): { board: Board; index: number } | null {
	const columns =
		col === undefined
			? Array.from({ length: COLS }, (_, c) => c).filter(
					(c) => landingCell(board, c) !== null,
				)
			: [col];
	if (columns.length === 0) return null;
	const index = landingCell(
		board,
		columns.length === 1 ? columns[0] : rng.pick(columns),
	);
	if (index === null) return null;
	const next = board.slice();
	next[index] = stone(drawLetter(rng, board));
	return { board: next, index };
}

/**
 * Stones fall straight down their column, then empty cells (all at the top) get fresh runes.
 * Returns the indexes that received new stones.
 */
export function collapseAndRefill(
	board: Board,
	rng: Rng,
	firstId: number,
): { board: Board; nextId: number; added: number[] } {
	const next: Cell[] = collapse(board).slice();
	const added: number[] = [];
	let nextId = firstId;
	for (let index = 0; index < CELL_COUNT; index++) {
		if (next[index]) continue;
		next[index] = { id: nextId++, letter: drawLetter(rng, next), kind: "rune" };
		added.push(index);
	}
	return { board: next, nextId, added };
}

/** Every curse swaps with the stone below it. Bottom-up, so stacked curses each move once. */
export function sinkCurses(board: Board): { board: Board; sunk: number[] } {
	const next = board.slice();
	const sunk: number[] = [];
	for (let row = ROWS - 2; row >= 0; row--) {
		for (let col = 0; col < COLS; col++) {
			const index = toIndex(col, row);
			const stone = next[index];
			const below = next[index + 1];
			if (stone?.kind !== "curse" || below?.kind === "curse") continue;
			next[index + 1] = stone;
			next[index] = below;
			sunk.push(stone.id);
		}
	}
	return { board: next, sunk };
}

export function hasCurseOnBottomRow(board: Board): boolean {
	for (let col = 0; col < COLS; col++) {
		if (board[toIndex(col, ROWS - 1)]?.kind === "curse") return true;
	}
	return false;
}

/** Rows between the lowest curse and the bottom of the board, or null when there are none. */
export function nearestCurse(board: Board): number | null {
	let nearest: number | null = null;
	for (let index = 0; index < board.length; index++) {
		if (board[index]?.kind !== "curse") continue;
		const rows = ROWS - 1 - (index % ROWS);
		if (nearest === null || rows < nearest) nearest = rows;
	}
	return nearest;
}

export function countCurses(board: Board): number {
	return board.filter((cell) => cell?.kind === "curse").length;
}

/** New letters for every plain rune; curses and crystals stay as they are. */
export function redrawRunes(board: Board, rng: Rng): Board {
	const next: Cell[] = board.map((cell) =>
		cell?.kind === "rune" ? null : cell,
	);
	for (let index = 0; index < CELL_COUNT; index++) {
		const old = board[index];
		if (old?.kind !== "rune") continue;
		next[index] = { id: old.id, letter: drawLetter(rng, next), kind: "rune" };
	}
	return next;
}

export function withCurse(board: Board, index: number): Board {
	const stone = board[index];
	if (!stone) return board;
	const next = board.slice();
	next[index] = { id: stone.id, letter: stone.letter, kind: "curse" };
	return next;
}

export function withCrystal(
	board: Board,
	index: number,
	tier: CrystalTier,
): Board {
	const stone = board[index];
	if (!stone) return board;
	const next = board.slice();
	next[index] = { id: stone.id, letter: stone.letter, kind: "crystal", tier };
	return next;
}
