import { describe, expect, it } from "vitest";
import { withinLimit } from "./rate-limit.server";

describe("withinLimit", () => {
	it("allows up to the limit in a window, then refills", () => {
		const key = `test-${Math.random()}`;
		expect(withinLimit(key, 30, 40, 60_000, 1000)).toBe(true);
		expect(withinLimit(key, 10, 40, 60_000, 2000)).toBe(true);
		expect(withinLimit(key, 1, 40, 60_000, 3000)).toBe(false);
		expect(withinLimit(key, 1, 40, 60_000, 61_000)).toBe(true);
	});

	it("never takes part of a cost it can't cover", () => {
		const key = `test-${Math.random()}`;
		expect(withinLimit(key, 35, 40, 60_000, 0)).toBe(true);
		expect(withinLimit(key, 10, 40, 60_000, 0)).toBe(false);
		expect(withinLimit(key, 5, 40, 60_000, 0)).toBe(true);
	});
});
