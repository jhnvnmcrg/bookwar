import { describe, expect, it } from "vitest";
import { CELL_COUNT } from "./config";
import { areAdjacent, NEIGHBORS, toIndex } from "./hex";

describe("hex neighbours", () => {
	it("handles the top-left corner", () => {
		expect(NEIGHBORS[toIndex(0, 0)]).toEqual([toIndex(0, 1), toIndex(1, 0)]);
	});

	it("puts an odd column's side neighbours on the same row and the row below", () => {
		expect(NEIGHBORS[toIndex(1, 0)]).toEqual(
			[
				toIndex(0, 0),
				toIndex(0, 1),
				toIndex(1, 1),
				toIndex(2, 0),
				toIndex(2, 1),
			].sort((a, b) => a - b),
		);
	});

	it("puts an even column's side neighbours on the row above and the same row", () => {
		expect(NEIGHBORS[toIndex(2, 3)]).toEqual(
			[
				toIndex(1, 2),
				toIndex(1, 3),
				toIndex(2, 2),
				toIndex(2, 4),
				toIndex(3, 2),
				toIndex(3, 3),
			].sort((a, b) => a - b),
		);
	});

	it("handles the bottom edge of an odd column", () => {
		expect(NEIGHBORS[toIndex(3, 7)]).toEqual(
			[toIndex(2, 7), toIndex(3, 6), toIndex(4, 7)].sort((a, b) => a - b),
		);
	});

	it("is symmetric and never more than 6", () => {
		for (let a = 0; a < CELL_COUNT; a++) {
			expect(NEIGHBORS[a].length).toBeLessThanOrEqual(6);
			expect(NEIGHBORS[a]).not.toContain(a);
			for (const b of NEIGHBORS[a]) expect(areAdjacent(b, a)).toBe(true);
		}
	});

	it("gives inner cells all 6 neighbours", () => {
		expect(NEIGHBORS[toIndex(3, 4)]).toHaveLength(6);
		expect(NEIGHBORS[toIndex(4, 4)]).toHaveLength(6);
	});

	it("rejects far cells and out-of-range indexes", () => {
		expect(areAdjacent(toIndex(0, 0), toIndex(0, 2))).toBe(false);
		expect(areAdjacent(toIndex(0, 0), toIndex(2, 0))).toBe(false);
		expect(areAdjacent(-1, 0)).toBe(false);
		expect(areAdjacent(CELL_COUNT, 0)).toBe(false);
	});
});
