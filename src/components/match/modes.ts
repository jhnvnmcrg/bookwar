import type { MatchMode } from "#/shared/protocol";

export const MODE_NAMES: Record<MatchMode, string> = {
	duel: "Duel",
	siege: "Siege",
};

/** "30 sec", "2 min", "90 sec". */
export function secondsLabel(seconds: number): string {
	return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} sec`;
}
