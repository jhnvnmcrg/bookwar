import { createActionGame, reduceAction } from "./modes/action";
import { createClassicGame, reduceClassic } from "./modes/classic";
import type {
	GameAction,
	GameMode,
	GameState,
	ReduceResult,
	WordList,
} from "./types";

export interface NewGameOptions {
	readonly mode: GameMode;
	readonly seed: string;
}

export function createGame(options: NewGameOptions): GameState {
	switch (options.mode) {
		case "classic":
			return createClassicGame(options.seed);
		case "action":
			return createActionGame(options.seed);
	}
}

/**
 * The single entry point for changing a game. Never mutates `state`; returns the next state
 * plus events for the UI to animate, or an error for an invalid move.
 */
export function reduce(
	state: GameState,
	action: GameAction,
	words: WordList,
): ReduceResult {
	switch (state.mode) {
		case "classic":
			return reduceClassic(state, action, words);
		case "action":
			return reduceAction(state, action, words);
	}
}
