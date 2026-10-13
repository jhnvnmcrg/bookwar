import { describe, expect, it } from "vitest";
import { Dictionary } from "./dictionary/dictionary";
import { findPath, findWords } from "./finder";
import { checkPath } from "./path";
import { boardFromRows, cells } from "./test-utils";

const words = new Dictionary([
	"cat",
	"cats",
	"act",
	"acts",
	"scat",
	"tea",
	"zebra",
]);

const board = boardFromRows([
	"c e e e e e e",
	"a e e e e e e",
	"t e e e e e e",
	"s e e e e e e",
	"e e e e e e e",
	"e e e e e e e",
	"e e e e e e e",
	"e e e e e e e",
]);

describe("findWords", () => {
	it("finds a planted word with a playable path", () => {
		const found = findWords(board, words);
		const cats = found.find((candidate) => candidate.word === "cats");
		expect(cats?.path).toEqual(cells([0, 0], [0, 1], [0, 2], [0, 3]));
		expect(found.map((candidate) => candidate.word)).toContain("cat");
		expect(found.map((candidate) => candidate.word)).not.toContain("zebra");
	});

	it("returns only valid moves, best score first", () => {
		const found = findWords(board, words);
		expect(found.length).toBeGreaterThan(0);
		for (const candidate of found) {
			expect(checkPath(board, candidate.path, words)).toMatchObject({
				ok: true,
				word: candidate.word,
			});
		}
		const scores = found.map((candidate) => candidate.score);
		expect(scores).toEqual([...scores].sort((a, b) => b - a));
		expect(new Set(found.map((candidate) => candidate.word)).size).toBe(
			found.length,
		);
	});

	it("respects maxLetters", () => {
		const found = findWords(board, words, { maxLetters: 3 });
		expect(found.every((candidate) => candidate.word.length <= 3)).toBe(true);
	});
});

describe("findPath", () => {
	const typed = boardFromRows([
		"c a e e e e e",
		"a t e e e e e",
		"t e e e e e e",
		"s e qu e e e e",
		"e e i e e e e",
		"e e t e e e e",
		"e e e e e e e",
		"e e e e e e e",
	]);

	it("finds a path for typed letters", () => {
		expect(findPath(typed, ["c", "a", "t"])).toEqual(
			cells([0, 0], [0, 1], [0, 2]),
		);
		expect(findPath(typed, ["qu", "i", "t"])).toEqual(
			cells([2, 3], [2, 4], [2, 5]),
		);
		expect(findPath(typed, [])).toEqual([]);
	});

	it("keeps the preferred path when it still matches", () => {
		// "ca" could start at (0,0)->(0,1) or (0,0)->(1,0); the current selection wins.
		const prefer = cells([0, 0], [1, 0]);
		expect(findPath(typed, ["c", "a", "t"], prefer)).toEqual([
			...prefer,
			...cells([1, 1]),
		]);
	});

	it("moves elsewhere when the preferred path can't continue", () => {
		const prefer = cells([0, 2]); // a "t" that can't start "cat"
		expect(findPath(typed, ["c", "a", "t"], prefer)).toEqual(
			cells([0, 0], [0, 1], [0, 2]),
		);
	});

	it("returns null when the board can't spell it", () => {
		expect(findPath(typed, ["z", "a", "p"])).toBeNull();
		expect(findPath(typed, ["c", "c"])).toBeNull();
	});

	it("gives up on hopeless searches instead of hanging", () => {
		const allE = boardFromRows(Array(8).fill("e e e e e e e"));
		const tooMany = Array.from({ length: 57 }, () => "e" as const);
		expect(findPath(allE, tooMany)).toBeNull();
	});
});
