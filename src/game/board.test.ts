import { describe, expect, it } from "vitest";
import {
	collapseAndRefill,
	createBoard,
	hasCurseOnBottomRow,
	redrawRunes,
	removeStones,
	sinkCurses,
} from "./board";
import { CELL_COUNT, VOWELS } from "./config";
import { toIndex } from "./hex";
import { Rng } from "./rng";
import { boardFromRows, cells } from "./test-utils";

const FILLER = "e e e e e e e";

describe("createBoard", () => {
	it("is the same for the same seed", () => {
		const a = createBoard(Rng.fromSeed("same"), 1);
		const b = createBoard(Rng.fromSeed("same"), 1);
		expect(a).toEqual(b);
		expect(a.board).toHaveLength(CELL_COUNT);
		expect(a.nextId).toBe(CELL_COUNT + 1);
	});

	it("differs between seeds", () => {
		const letters = (seed: string) =>
			createBoard(Rng.fromSeed(seed), 1).board.map((cell) => cell?.letter);
		expect(letters("one")).not.toEqual(letters("two"));
	});

	it("keeps vowels balanced and at most one Qu", () => {
		for (let i = 0; i < 100; i++) {
			const { board } = createBoard(Rng.fromSeed(`balance-${i}`), 1);
			const letters = board.map((cell) => cell?.letter);
			const vowels = letters.filter((l) => l && VOWELS.has(l)).length;
			expect(vowels / CELL_COUNT).toBeGreaterThanOrEqual(0.25);
			expect(vowels / CELL_COUNT).toBeLessThanOrEqual(0.55);
			expect(letters.filter((l) => l === "qu").length).toBeLessThanOrEqual(1);
			expect(board.every((cell) => cell?.kind === "rune")).toBe(true);
		}
	});
});

describe("collapseAndRefill", () => {
	it("drops stones down their column and refills the top", () => {
		const board = boardFromRows([
			"a e e e e e e",
			"b e e e e e e",
			"c e e e e e e",
			"d e e e e e e",
			"f e e e e e e",
			"g e e e e e e",
			"h e e e e e e",
			"i e e e e e e",
		]);
		const removed = removeStones(board, cells([0, 6], [0, 7]));
		const result = collapseAndRefill(removed, Rng.fromSeed("refill"), 1000);

		// "a".."g" each fell two rows, keeping their ids.
		expect(result.board[toIndex(0, 7)]).toEqual(board[toIndex(0, 5)]);
		expect(result.board[toIndex(0, 2)]).toEqual(board[toIndex(0, 0)]);
		expect(result.added).toEqual(cells([0, 0], [0, 1]));
		expect(result.board[toIndex(0, 0)]?.id).toBe(1000);
		expect(result.board[toIndex(0, 1)]?.id).toBe(1001);
		expect(result.nextId).toBe(1002);
		expect(result.board.every((cell) => cell !== null)).toBe(true);
		// Other columns untouched.
		expect(result.board.slice(8)).toEqual(board.slice(8));
	});

	it("does not mutate its input", () => {
		const board = boardFromRows(Array(8).fill(FILLER));
		const removed = removeStones(board, [3]);
		const copy = [...removed];
		collapseAndRefill(removed, Rng.fromSeed("pure"), 1000);
		expect(removed).toEqual(copy);
		expect(board[3]).not.toBeNull();
	});
});

describe("sinkCurses", () => {
	it("moves each curse down one row, swapping with the stone below", () => {
		const board = boardFromRows([
			FILLER,
			FILLER,
			"e e !x e e e e",
			"e e a e e e e",
			FILLER,
			FILLER,
			FILLER,
			FILLER,
		]);
		const curse = board[toIndex(2, 2)];
		const below = board[toIndex(2, 3)];
		const result = sinkCurses(board);
		expect(result.board[toIndex(2, 3)]).toEqual(curse);
		expect(result.board[toIndex(2, 2)]).toEqual(below);
		expect(result.sunk).toEqual([curse?.id]);
	});

	it("moves stacked curses one row each", () => {
		const board = boardFromRows([
			FILLER,
			FILLER,
			"e e e !x e e e",
			"e e e !y e e e",
			FILLER,
			FILLER,
			FILLER,
			FILLER,
		]);
		const result = sinkCurses(board);
		expect(result.board[toIndex(3, 3)]?.letter).toBe("x");
		expect(result.board[toIndex(3, 4)]?.letter).toBe("y");
		expect(result.sunk).toHaveLength(2);
	});

	it("leaves a curse on the bottom row in place", () => {
		const rows = Array(8).fill(FILLER);
		rows[7] = "e !x e e e e e";
		const board = boardFromRows(rows);
		expect(hasCurseOnBottomRow(board)).toBe(true);
		expect(sinkCurses(board).board).toEqual(board);
	});
});

describe("redrawRunes", () => {
	it("changes plain runes only and keeps every id", () => {
		const rows = Array(8).fill(FILLER);
		rows[0] = "!z e e e e e a3";
		const board = boardFromRows(rows);
		const redrawn = redrawRunes(board, Rng.fromSeed("shuffle"));
		expect(redrawn[toIndex(0, 0)]).toEqual(board[toIndex(0, 0)]);
		expect(redrawn[toIndex(6, 0)]).toEqual(board[toIndex(6, 0)]);
		expect(redrawn.map((cell) => cell?.id)).toEqual(
			board.map((cell) => cell?.id),
		);
		expect(redrawn.some((cell, i) => cell?.letter !== board[i]?.letter)).toBe(
			true,
		);
	});
});
