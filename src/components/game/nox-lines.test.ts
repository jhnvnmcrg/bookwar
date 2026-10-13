import { describe, expect, it } from "vitest";
import type { GameEvent } from "#/game";
import { actionWith, boardFromRows, classicWith } from "#/game/test-utils";
import {
	dangerLine,
	emptyCells,
	lineForMove,
	lineForRejection,
	nearestCurse,
	openingLine,
} from "./nox-lines";

const FULL = "e e e e e e e";
const EMPTY = ". . . . . . .";
const plain = classicWith(boardFromRows(Array(8).fill(FULL)));
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
		const rows = Array(8).fill(FULL);
		rows[2] = "e !e e e e e e";
		rows[5] = "e e e !e e e e";
		expect(nearestCurse(boardFromRows(rows))).toBe(2);
		expect(nearestCurse(plain.board)).toBeNull();
	});
});

describe("lineForMove", () => {
	it("puts the end of the game above everything else", () => {
		expect(lineForMove([word, { type: "tower-fell" }], plain).mood).toBe("sad");
		expect(lineForMove([{ type: "buried" }], plain).text).toContain("buried");
	});

	it("warns when a curse is close to the bottom", () => {
		const rows = Array(8).fill(FULL);
		rows[6] = "e e !e e e e e";
		const line = lineForMove([word], classicWith(boardFromRows(rows)));
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
		expect(lineForMove([], plain)).toEqual(openingLine("classic"));
	});
});

describe("Action warnings", () => {
	it("counts empty cells and warns when space runs low", () => {
		const roomy = actionWith(
			boardFromRows([EMPTY, EMPTY, EMPTY, FULL, FULL, FULL, FULL, FULL]),
		);
		expect(emptyCells(roomy.board)).toBe(21);
		expect(dangerLine(roomy)).toBeNull();

		const rows = Array(8).fill(FULL);
		rows[0] = "e e . . . e e";
		const tight = actionWith(boardFromRows(rows));
		expect(dangerLine(tight)?.text).toContain("Only 3 spaces left");

		const full = actionWith(boardFromRows(Array(8).fill(FULL)));
		expect(dangerLine(full)?.text).toContain("board is full");
	});
});

describe("lineForRejection", () => {
	it("names the word that isn't in the spellbook", () => {
		expect(lineForRejection("not-a-word", "xyz").text).toContain("“xyz”");
	});
});
