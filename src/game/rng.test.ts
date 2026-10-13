import { describe, expect, it } from "vitest";
import { Rng } from "./rng";

const draw = (rng: Rng, count: number) =>
	Array.from({ length: count }, () => rng.next());

describe("Rng", () => {
	it("repeats the same sequence for the same seed", () => {
		expect(draw(Rng.fromSeed("tower"), 20)).toEqual(
			draw(Rng.fromSeed("tower"), 20),
		);
	});

	it("gives different sequences for different seeds", () => {
		expect(draw(Rng.fromSeed("tower"), 5)).not.toEqual(
			draw(Rng.fromSeed("towers"), 5),
		);
	});

	it("continues exactly from a saved state", () => {
		const rng = Rng.fromSeed("save");
		draw(rng, 7);
		const resumed = new Rng(rng.state);
		expect(draw(resumed, 10)).toEqual(draw(rng, 10));
	});

	it("keeps values in range", () => {
		const rng = Rng.fromSeed("range");
		for (let i = 0; i < 1000; i++) {
			const value = rng.next();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
			const n = rng.int(7);
			expect(Number.isInteger(n) && n >= 0 && n < 7).toBe(true);
		}
	});

	it("stores state as plain unsigned numbers", () => {
		const state = Rng.fromSeed("json").state;
		expect(JSON.parse(JSON.stringify(state))).toEqual(state);
		for (const word of state) expect(word).toBeGreaterThanOrEqual(0);
	});
});
