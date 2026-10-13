import { describe, expect, it } from "vitest";
import { crystalMultiplier, lengthMultiplier, scoreWord } from "./scoring";
import { crystalTierFor } from "./specials";
import type { CrystalTier, Letter, Stone } from "./types";

const rune = (letter: Letter): Stone => ({ id: 0, letter, kind: "rune" });
const crystal = (letter: Letter, tier: CrystalTier): Stone => ({
	id: 0,
	letter,
	kind: "crystal",
	tier,
});

describe("scoring", () => {
	it("adds letter points, applies length and scales", () => {
		// c 3 + a 1 + t 1 = 5 points, 3 letters x1, x10
		expect(scoreWord(["c", "a", "t"].map((l) => rune(l as Letter))).total).toBe(
			50,
		);
		// w4 i1 z10 a1 r1 d2 = 19, 6 letters x2.5
		expect(
			scoreWord(["w", "i", "z", "a", "r", "d"].map((l) => rune(l as Letter)))
				.total,
		).toBe(475);
	});

	it("uses the length multiplier table", () => {
		expect([2, 3, 4, 5, 6, 7, 8, 9, 10].map(lengthMultiplier)).toEqual([
			0, 1, 1.5, 2, 2.5, 3, 4, 5, 6,
		]);
	});

	it("counts Qu as two letters", () => {
		// qu10 + i1 + t1 = 12 points, 4 letters x1.5
		const result = scoreWord([rune("qu"), rune("i"), rune("t")]);
		expect(result.lengthMultiplier).toBe(1.5);
		expect(result.total).toBe(180);
	});

	it("multiplies crystals together, capped at x6", () => {
		expect(scoreWord([crystal("c", 2), rune("a"), rune("t")]).total).toBe(100);
		expect(crystalMultiplier([crystal("a", 1), crystal("b", 2)])).toBe(3);
		expect(crystalMultiplier([crystal("a", 3), crystal("b", 4)])).toBe(6);
	});
});

describe("crystal tiers", () => {
	it("grows with word length", () => {
		expect([3, 4, 5, 6, 7, 8, 12].map(crystalTierFor)).toEqual([
			null,
			null,
			1,
			2,
			3,
			4,
			4,
		]);
	});
});
