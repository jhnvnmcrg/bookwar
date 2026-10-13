import type { GameMode } from "#/game";

/** How each Solo mode is named and described to players. */
export const SOLO_MODES = {
	classic: {
		name: "Classic",
		summary:
			"No clock. Long words forge crystals that multiply your score; short words invite curses.",
		shuffle: "New letters for every plain stone. Adds a curse rune.",
	},
	action: {
		name: "Action",
		summary:
			"Stones keep falling from above, faster as you rise. Clear room before the board fills.",
		shuffle: "New letters for every plain stone. Three more stones fall.",
	},
} as const satisfies Record<
	GameMode,
	{ name: string; summary: string; shuffle: string }
>;

export const SOLO_MODE_LIST = Object.keys(SOLO_MODES) as GameMode[];

export const isSoloMode = (value: string): value is GameMode =>
	value in SOLO_MODES;
