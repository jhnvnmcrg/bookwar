import { describe, expect, it, vi } from "vitest";
import { isMuted, playSound, setMuted, subscribeMuted } from "./sound";

describe("sound", () => {
	it("is on by default, and tells listeners when it's switched", () => {
		expect(isMuted()).toBe(false);
		const listener = vi.fn();
		const stop = subscribeMuted(listener);
		setMuted(true);
		expect(isMuted()).toBe(true);
		expect(listener).toHaveBeenCalledTimes(1);
		stop();
		setMuted(false);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("never throws, even without Web Audio", () => {
		for (const name of ["select", "cast", "towerFall", "win"] as const)
			expect(() => playSound(name, 4)).not.toThrow();
	});
});
