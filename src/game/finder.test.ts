import { describe, expect, it } from "vitest";
import { Dictionary } from "./dictionary/dictionary";
import { findWords } from "./finder";
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
