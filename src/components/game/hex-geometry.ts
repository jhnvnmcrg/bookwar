import { CELL_COUNT, COLS, colOf, ROWS, rowOf } from "#/game";

/** SVG units from a cell's centre to its corner (flat-top hexes). */
export const HEX_SIZE = 50;
export const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE;
/** Visible stone radius; the difference is the gap between stones. */
export const STONE_RADIUS = HEX_SIZE - 3.5;
/** Space between the outermost stones and the gilded frame. */
export const BOARD_PADDING = 22;

export const BOARD_WIDTH =
	2 * BOARD_PADDING + HEX_SIZE * (1.5 * (COLS - 1) + 2);
export const BOARD_HEIGHT = 2 * BOARD_PADDING + HEX_HEIGHT * (ROWS + 0.5);

export interface Point {
	readonly x: number;
	readonly y: number;
}

/** Centre of a board cell in SVG units. Odd columns sit half a cell lower. */
export function cellCenter(index: number): Point {
	const col = colOf(index);
	const row = rowOf(index);
	return {
		x: BOARD_PADDING + HEX_SIZE + col * 1.5 * HEX_SIZE,
		y:
			BOARD_PADDING +
			HEX_HEIGHT / 2 +
			row * HEX_HEIGHT +
			(col % 2 === 1 ? HEX_HEIGHT / 2 : 0),
	};
}

/** How far a spell-thread link stops short of each stone's centre, so it never covers a letter. */
const LINK_TRIM = 25;

/** The visible part of a spell thread between two neighbouring stones. */
export function threadLink(from: Point, to: Point) {
	const length = Math.hypot(to.x - from.x, to.y - from.y);
	const ux = (to.x - from.x) / length;
	const uy = (to.y - from.y) / length;
	return {
		x1: from.x + ux * LINK_TRIM,
		y1: from.y + uy * LINK_TRIM,
		x2: to.x - ux * LINK_TRIM,
		y2: to.y - uy * LINK_TRIM,
	};
}

/** Points attribute for a flat-top hexagon centred on 0,0. */
export function hexPoints(radius: number): string {
	return Array.from({ length: 6 }, (_, k) => {
		const angle = (Math.PI / 3) * k;
		return `${(radius * Math.cos(angle)).toFixed(2)},${(radius * Math.sin(angle)).toFixed(2)}`;
	}).join(" ");
}

/**
 * The cell under a point, or null. Only counts the inner part of a stone so a drag that
 * grazes a corner doesn't pick up a diagonal neighbour by accident.
 */
export function cellAt(point: Point, reach = 0.78): number | null {
	let best: number | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (let index = 0; index < CELL_COUNT; index++) {
		const center = cellCenter(index);
		const distance = Math.hypot(point.x - center.x, point.y - center.y);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = index;
		}
	}
	return bestDistance <= HEX_SIZE * reach ? best : null;
}
