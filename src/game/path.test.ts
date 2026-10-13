import { describe, expect, it } from "vitest";
import { Dictionary } from "./dictionary/dictionary";
import { checkPath } from "./path";
import { boardFromRows, cells } from "./test-utils";

const words = new Dictionary(["cat", "act", "tea", "qua", "quit"]);

const board = boardFromRows([
	"c e qu e e e e",
	"a e a e e e e",
	"t e i e e e e",
	"e e t e e e e",
	"e e e e e e e",
	"e e e e e e e",
	"e e e e e e e",
	"e e e e e e e",
]);

describe("checkPath", () => {
	it("accepts a word down a column", () => {
		const result = checkPath(board, cells([0, 0], [0, 1], [0, 2]), words);
		expect(result).toMatchObject({ ok: true, word: "cat" });
	});

	it("accepts a word across columns", () => {
		// (0,1) "a" touches (1,0) and (1,1); (0,0) "c" touches (0,1).
		const sideways = boardFromRows([
			"c t e e e e e",
			"a e e e e e e",
			"e e e e e e e",
			"e e e e e e e",
			"e e e e e e e",
			"e e e e e e e",
			"e e e e e e e",
			"e e e e e e e",
		]);
		expect(
			checkPath(sideways, cells([0, 1], [0, 0], [1, 0]), words),
		).toMatchObject({
			ok: true,
			word: "act",
		});
	});

	it("counts Qu as two letters", () => {
		expect(checkPath(board, cells([2, 0], [2, 1]), words)).toMatchObject({
			ok: true,
			word: "qua",
		});
		expect(
			checkPath(board, cells([2, 0], [2, 2], [2, 3]), words),
		).toMatchObject({
			ok: false,
			error: "not-adjacent",
		});
	});

	it("rejects stones that don't touch", () => {
		expect(checkPath(board, cells([0, 0], [0, 2], [0, 1]), words)).toEqual({
			ok: false,
			error: "not-adjacent",
		});
	});

	it("rejects reusing a stone", () => {
		expect(checkPath(board, cells([0, 0], [0, 1], [0, 0]), words)).toEqual({
			ok: false,
			error: "reused-stone",
		});
	});

	it("rejects short words and unknown words", () => {
		expect(checkPath(board, cells([0, 0], [0, 1]), words)).toEqual({
			ok: false,
			error: "too-short",
		});
		expect(checkPath(board, cells([0, 1], [0, 2], [0, 3]), words)).toEqual({
			ok: false,
			error: "not-a-word",
		});
	});

	it("rejects malformed paths", () => {
		for (const path of [[], [-1, 0, 1], [0, 1, 99], [0, 1.5, 2]]) {
			expect(checkPath(board, path, words)).toEqual({
				ok: false,
				error: "bad-path",
			});
		}
	});
});
