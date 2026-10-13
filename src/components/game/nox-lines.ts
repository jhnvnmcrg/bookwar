// What Nox says after each move. Doubles as the in-game help, so lines explain what to do.
import {
	type Board,
	crystalSpec,
	type GameEvent,
	type PlayError,
	ROWS,
	rowOf,
} from "#/game";
import type { NoxMood } from "../brand/Nox";

export interface NoxLine {
	readonly mood: NoxMood;
	readonly text: string;
}

export const OPENING_LINE: NoxLine = {
	mood: "idle",
	text: "Link touching stones to spell a word. Long words forge crystals; short ones invite curses.",
};

const points = (value: number) => value.toLocaleString("en-US");

/** Rows between the lowest curse and the bottom of the board, or null when there are none. */
export function nearestCurse(board: Board): number | null {
	let nearest: number | null = null;
	for (let index = 0; index < board.length; index++) {
		if (board[index]?.kind !== "curse") continue;
		const rows = ROWS - 1 - rowOf(index);
		if (nearest === null || rows < nearest) nearest = rows;
	}
	return nearest;
}

export function lineForMove(
	events: readonly GameEvent[],
	board: Board,
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
			text: `You've risen to ${levelUp.rank}. The new prophecy is “${levelUp.prophecy}”.`,
		};
	}
	const curse = nearestCurse(board);
	if (curse !== null && curse <= 2) {
		return {
			mood: "worried",
			text:
				curse === 1
					? "A curse is one row from the bottom. Spell a word through it now!"
					: "A curse is two rows from the bottom. Use it in your next words.",
		};
	}
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
		return { mood: "idle", text: "Fresh letters, and a curse came with them." };
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
	return OPENING_LINE;
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
				text: "The tower has fallen. Start a new game to keep playing.",
			};
		default:
			return {
				mood: "worried",
				text: "Each stone in a word must touch the one before it.",
			};
	}
}
