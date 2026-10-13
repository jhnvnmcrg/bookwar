import { describe, expect, it } from "vitest";
import type { GameEvent } from "#/game";
import { boardFromRows } from "#/game/test-utils";
import {
	lineForMove,
	lineForRejection,
	nearestCurse,
	OPENING_LINE,
} from "./nox-lines";

const plain = boardFromRows(Array(8).fill("e e e e e e e"));
const word: GameEvent = {
	type: "word",
	word: "cat",
	path: [0, 1, 2],
	score: 50,
	crystalMultiplier: 1,
	cursesBroken: 0,
};

describe("nearestCurse", () => {
	it("measures rows to the bottom from the lowest curse", () => {
		const rows = Array(8).fill("e e e e e e e");
		rows[2] = "e !e e e e e e";
		rows[5] = "e e e !e e e e";
		expect(nearestCurse(boardFromRows(rows))).toBe(2);
		expect(nearestCurse(plain)).toBeNull();
	});
});

describe("lineForMove", () => {
	it("puts the tower falling above everything else", () => {
		expect(lineForMove([word, { type: "tower-fell" }], plain).mood).toBe("sad");
	});

	it("warns when a curse is close to the bottom", () => {
		const rows = Array(8).fill("e e e e e e e");
		rows[6] = "e e !e e e e e";
		const line = lineForMove([word], boardFromRows(rows));
		expect(line.mood).toBe("worried");
		expect(line.text).toContain("one row");
	});

	it("explains a new crystal", () => {
		const line = lineForMove(
			[word, { type: "crystal-formed", id: 9, tier: 2 }],
			plain,
		);
		expect(line.text).toContain("sapphire");
		expect(line.text).toContain("×2");
	});

	it("reports an ordinary word", () => {
		expect(lineForMove([word], plain).text).toBe("“cat” for 50.");
		expect(lineForMove([], plain)).toBe(OPENING_LINE);
	});
});

describe("lineForRejection", () => {
	it("names the word that isn't in the spellbook", () => {
		expect(lineForRejection("not-a-word", "xyz").text).toContain("“xyz”");
	});
});
