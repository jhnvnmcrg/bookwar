import type { RngState } from "./types";

/** cyrb128: hashes a seed string into four 32-bit words for sfc32. */
function hashSeed(seed: string): RngState {
	let h1 = 1779033703;
	let h2 = 3144134277;
	let h3 = 1013904242;
	let h4 = 2773480762;
	for (let i = 0; i < seed.length; i++) {
		const k = seed.charCodeAt(i);
		h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
		h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
		h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
		h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
	}
	h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
	h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
	h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
	h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
	h1 ^= h2 ^ h3 ^ h4;
	h2 ^= h1;
	h3 ^= h1;
	h4 ^= h1;
	return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * sfc32 generator. Game code builds one from the saved state, draws from it, and stores
 * `rng.state` back, so the same seed and moves always give the same game.
 */
export class Rng {
	private a: number;
	private b: number;
	private c: number;
	private d: number;

	constructor(state: RngState) {
		this.a = state[0];
		this.b = state[1];
		this.c = state[2];
		this.d = state[3];
	}

	static fromSeed(seed: string): Rng {
		const rng = new Rng(hashSeed(seed));
		for (let i = 0; i < 15; i++) rng.next();
		return rng;
	}

	get state(): RngState {
		return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
	}

	/** Uniform in [0, 1). */
	next(): number {
		const t = (((this.a + this.b) | 0) + this.d) | 0;
		this.d = (this.d + 1) | 0;
		this.a = this.b ^ (this.b >>> 9);
		this.b = (this.c + (this.c << 3)) | 0;
		this.c = (this.c << 21) | (this.c >>> 11);
		this.c = (this.c + t) | 0;
		return (t >>> 0) / 4294967296;
	}

	/** Integer in [0, maxExclusive). */
	int(maxExclusive: number): number {
		return Math.floor(this.next() * maxExclusive);
	}

	chance(probability: number): boolean {
		return this.next() < probability;
	}

	pick<T>(items: readonly T[]): T {
		if (items.length === 0) throw new Error("Rng.pick: empty list");
		return items[this.int(items.length)];
	}
}
