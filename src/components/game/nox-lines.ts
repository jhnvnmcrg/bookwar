// What Nox says after each move. Doubles as the in-game help, so lines explain what to do.
import {
	type Board,
	crystalSpec,
	type GameEvent,
	type GameMode,
	type GameState,
	nearestCurse,
	type PlayError,
} from "#/game";
import type { NoxMood } from "../brand/Nox";

export interface NoxLine {
	readonly mood: NoxMood;
	readonly text: string;
}

/** Below this many empty cells in Action mode, Nox starts warning. */
export const LOW_SPACE = 7;

export function openingLine(mode: GameMode): NoxLine {
	return mode === "action"
		? {
				mood: "idle",
				text: "Stones keep falling. Spell words to clear room before the board fills to the top.",
			}
		: {
				mood: "idle",
				text: "Link touching stones to spell a word. Long words forge crystals; short ones invite curses.",
			};
}

const points = (value: number) => value.toLocaleString("en-US");

export { nearestCurse };

export function emptyCells(board: Board): number {
	return board.filter((cell) => cell === null).length;
}

/** The warning for the current board, if it's in danger. */
export function dangerLine(
	state: Pick<GameState, "mode" | "board">,
): NoxLine | null {
	if (state.mode === "action") {
		const space = emptyCells(state.board);
		if (space === 0) {
			return {
				mood: "worried",
				text: "The board is full! The next stone will bury your tower. Cast a word now!",
			};
		}
		return space <= LOW_SPACE
			? {
					mood: "worried",
					text: `Only ${space} ${space === 1 ? "space" : "spaces"} left. Long words clear the most room.`,
				}
			: null;
	}
	const curse = nearestCurse(state.board);
	if (curse === null || curse > 2) return null;
	return {
		mood: "worried",
		text:
			curse === 1
				? "A curse is one row from the bottom. Spell a word through it now!"
				: "A curse is two rows from the bottom. Use it in your next words.",
	};
}

export function lineForMove(
	events: readonly GameEvent[],
	state: Pick<GameState, "mode" | "board">,
): NoxLine {
	const find = <T extends GameEvent["type"]>(type: T) =>
		events.find(
			(event): event is Extract<GameEvent, { type: T }> => event.type === type,
		);

	if (find("tower-fell")) {
		return {
			mood: "sad",
			text: "A curse reached the bottom row. Your tower has fallen.",
		};
	}
	if (find("buried")) {
		return {
			mood: "sad",
			text: "A stone had nowhere to land. Your tower is buried.",
		};
	}
	const prophecy = find("prophecy-fulfilled");
	if (prophecy) {
		return {
			mood: "wow",
			text: `The prophecy is fulfilled! ${points(prophecy.bonus)} bonus points.`,
		};
	}
	const levelUp = find("level-up");
	if (levelUp) {
		return {
			mood: "wow",
			text:
				state.mode === "action"
					? `You've risen to ${levelUp.rank}. Stones will fall faster now.`
					: `You've risen to ${levelUp.rank}. The new prophecy is “${levelUp.prophecy}”.`,
		};
	}
	const danger = dangerLine(state);
	if (danger) return danger;
	const crystal = find("crystal-formed");
	if (crystal) {
		const spec = crystalSpec(crystal.tier);
		return {
			mood: "wow",
			text: `A ${spec.name}! Use it in a word to multiply that word's score ×${spec.multiplier}.`,
		};
	}
	if (find("curse-appeared")) {
		return {
			mood: "worried",
			text: "A curse rune appeared. It sinks a row with every word, so use it before it reaches the bottom.",
		};
	}
	if (find("shuffled")) {
		return state.mode === "action"
			? { mood: "idle", text: "Fresh letters, and three more stones fell." }
			: { mood: "idle", text: "Fresh letters, and a curse came with them." };
	}
	const word = find("word");
	if (word) {
		if (word.cursesBroken > 0) {
			return {
				mood: "happy",
				text: `Curse broken! “${word.word}” for ${points(word.score)}.`,
			};
		}
		return word.score >= 300
			? {
					mood: "happy",
					text: `Splendid! “${word.word}” for ${points(word.score)}.`,
				}
			: { mood: "idle", text: `“${word.word}” for ${points(word.score)}.` };
	}
	return openingLine(state.mode);
}

export function lineForRejection(error: PlayError, word: string): NoxLine {
	switch (error) {
		case "not-a-word":
			return {
				mood: "worried",
				text: `“${word}” isn't in the spellbook. Try another word.`,
			};
		case "too-short":
			return { mood: "idle", text: "Words need at least three letters." };
		case "game-over":
			return {
				mood: "sad",
				text: "This game is over. Start a new one to keep playing.",
			};
		default:
			return {
				mood: "worried",
				text: "Each stone in a word must touch the one before it.",
			};
	}
}
