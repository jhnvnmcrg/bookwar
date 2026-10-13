import { describe, expect, it } from "vitest";
import { toIndex } from "#/game";
import {
	dragOnto,
	pressStone,
	releaseOnSelected,
	typedLetters,
} from "./selection";

const a = toIndex(0, 0);
const b = toIndex(0, 1); // touches a
const c = toIndex(1, 1); // touches b
const far = toIndex(5, 6);

describe("pressStone", () => {
	it("starts a path on an empty selection", () => {
		expect(pressStone([], a)).toEqual({ kind: "changed", selection: [a] });
	});

	it("extends the path with a touching stone", () => {
		expect(pressStone([a], b)).toEqual({ kind: "changed", selection: [a, b] });
	});

	it("starts over on a stone that doesn't touch the end", () => {
		expect(pressStone([a, b], far)).toEqual({
			kind: "changed",
			selection: [far],
		});
	});

	it("defers a press on a selected stone", () => {
		expect(pressStone([a, b], a)).toEqual({ kind: "deferred" });
	});
});

describe("dragOnto", () => {
	it("extends onto touching stones and ignores far ones", () => {
		expect(dragOnto([a], b)).toEqual([a, b]);
		expect(dragOnto([a, b], far)).toEqual([a, b]);
	});

	it("steps back when dragging onto the previous stone", () => {
		expect(dragOnto([a, b, c], b)).toEqual([a, b]);
	});

	it("never reuses a stone", () => {
		const loop = [a, b, c];
		expect(dragOnto(loop, a)).toBe(loop);
	});
});

describe("releaseOnSelected", () => {
	it("casts when the last stone is tapped again", () => {
		expect(releaseOnSelected([a, b, c], c)).toEqual({ kind: "cast" });
	});

	it("clears a single stone tapped twice", () => {
		expect(releaseOnSelected([a], a)).toEqual({
			kind: "changed",
			selection: [],
		});
	});

	it("trims the path back to an earlier stone", () => {
		expect(releaseOnSelected([a, b, c], b)).toEqual({
			kind: "changed",
			selection: [a, b],
		});
	});
});

describe("typedLetters", () => {
	it("maps keys to stone letters", () => {
		expect(typedLetters("Cat")).toEqual(["c", "a", "t"]);
		expect(typedLetters("quit")).toEqual(["qu", "i", "t"]);
		expect(typedLetters("q")).toEqual(["qu"]);
		expect(typedLetters("a-1 b")).toEqual(["a", "b"]);
	});
});
