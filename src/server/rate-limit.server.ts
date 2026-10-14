// A small allowance per player (or address) for work that costs the server real effort:
// replaying games, opening rooms.

interface Allowance {
	startedAt: number;
	used: number;
}

export class RateLimiter {
	private readonly allowances = new Map<string, Allowance>();

	/**
	 * Takes `cost` from the key's allowance of `limit` per `windowMs`. Returns false, taking
	 * nothing, when that would go over.
	 */
	take(
		key: string,
		cost: number,
		limit: number,
		windowMs: number,
		now = Date.now(),
	): boolean {
		let allowance = this.allowances.get(key);
		if (!allowance || now - allowance.startedAt >= windowMs) {
			allowance = { startedAt: now, used: 0 };
			this.allowances.set(key, allowance);
			// Old allowances are only cleared when the map grows, which is often enough.
			if (this.allowances.size > 10_000)
				for (const [other, entry] of this.allowances)
					if (now - entry.startedAt >= windowMs) this.allowances.delete(other);
		}
		if (allowance.used + cost > limit) return false;
		allowance.used += cost;
		return true;
	}
}

// One limiter for server functions, shared by both server bundles.
const shared = globalThis as typeof globalThis & {
	__bookwarLimits?: RateLimiter;
};

/** `RateLimiter.take` on the process-wide limiter. */
export function withinLimit(
	key: string,
	cost: number,
	limit: number,
	windowMs: number,
	now = Date.now(),
): boolean {
	shared.__bookwarLimits ??= new RateLimiter();
	return shared.__bookwarLimits.take(key, cost, limit, windowMs, now);
}
