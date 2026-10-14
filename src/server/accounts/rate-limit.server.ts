// A small per-player allowance for work that costs the server real effort (replaying games).

interface Window {
	startedAt: number;
	used: number;
}

const shared = globalThis as typeof globalThis & {
	__bookwarLimits?: Map<string, Window>;
};

/**
 * Takes `cost` from the key's allowance of `limit` per `windowMs`. Returns false, taking
 * nothing, when that would go over.
 */
export function withinLimit(
	key: string,
	cost: number,
	limit: number,
	windowMs: number,
	now = Date.now(),
): boolean {
	shared.__bookwarLimits ??= new Map();
	const limits = shared.__bookwarLimits;
	let window = limits.get(key);
	if (!window || now - window.startedAt >= windowMs) {
		window = { startedAt: now, used: 0 };
		limits.set(key, window);
		// Old windows are only cleared when the map grows, which is often enough.
		if (limits.size > 10_000)
			for (const [other, entry] of limits)
				if (now - entry.startedAt >= windowMs) limits.delete(other);
	}
	if (window.used + cost > limit) return false;
	window.used += cost;
	return true;
}
