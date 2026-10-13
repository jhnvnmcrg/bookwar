import { CELL_COUNT, COLS, ROWS } from "./config";

export const toIndex = (col: number, row: number): number => col * ROWS + row;
export const colOf = (index: number): number => Math.floor(index / ROWS);
export const rowOf = (index: number): number => index % ROWS;

const isInside = (col: number, row: number): boolean =>
	col >= 0 && col < COLS && row >= 0 && row < ROWS;

function computeNeighbors(index: number): number[] {
	const col = colOf(index);
	const row = rowOf(index);
	// Odd columns sit half a cell lower, so side neighbours shift by parity.
	const sideRows = col % 2 === 0 ? [row - 1, row] : [row, row + 1];
	const candidates = [
		[col, row - 1],
		[col, row + 1],
		...sideRows.flatMap((r) => [
			[col - 1, r],
			[col + 1, r],
		]),
	];
	return candidates
		.filter(([c, r]) => isInside(c, r))
		.map(([c, r]) => toIndex(c, r))
		.sort((x, y) => x - y);
}

/** Indexes each cell touches (up to 6), sorted. */
export const NEIGHBORS: readonly (readonly number[])[] = Array.from(
	{ length: CELL_COUNT },
	(_, index) => computeNeighbors(index),
);

export function areAdjacent(a: number, b: number): boolean {
	return NEIGHBORS[a]?.includes(b) ?? false;
}
