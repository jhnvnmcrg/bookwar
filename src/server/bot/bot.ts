// The built-in AI rival: finds every word on its board and picks one to suit its difficulty.
import { nearestCurse } from "../../game/board";
import { type Candidate, findWords } from "../../game/finder";
import type { Board, GameAction, GameState, WordList } from "../../game/types";
import type { BotDifficulty } from "../../shared/protocol";

export const BOT_NAMES: Record<BotDifficulty, string> = {
	easy: "Apprentice Pip",
	medium: "Adept Elowen",
	hard: "Archmage Morwen",
};

/** Seconds the bot "thinks" before each move: [min, max]. */
const THINKING: Record<BotDifficulty, readonly [number, number]> = {
	easy: [7, 11],
	medium: [4, 7],
	hard: [2, 4],
};

/** How close a curse may get (rows from the bottom) before the bot goes after it. */
const CURSE_ALERT: Record<BotDifficulty, number> = {
	easy: 0,
	medium: 1,
	hard: 2,
};
const MAX_LETTERS: Record<BotDifficulty, number> = {
	easy: 6,
	medium: 8,
	hard: 10,
};

export function thinkingMs(
	difficulty: BotDifficulty,
	random: () => number,
): number {
	const [min, max] = THINKING[difficulty];
	return Math.round((min + random() * (max - min)) * 1000);
}

/** The words the bot would consider, best first. Exported for the Gemini picker. */
export function botCandidates(
	board: Board,
	words: WordList,
	difficulty: BotDifficulty,
): Candidate[] {
	return findWords(board, words, { maxLetters: MAX_LETTERS[difficulty] });
}

/**
 * Easy plays middling short words, Medium a random word from the top quarter, Hard one of the
 * top three. When a curse gets close, Medium and Hard spell through it first.
 */
export function chooseMove(
	board: Board,
	words: WordList,
	difficulty: BotDifficulty,
	random: () => number,
): GameAction {
	const candidates = botCandidates(board, words, difficulty);
	if (candidates.length === 0) return { type: "shuffle" };
	const pick = (list: readonly Candidate[]) =>
		list[Math.floor(random() * list.length)];

	const curse = nearestCurse(board);
	if (curse !== null && curse <= CURSE_ALERT[difficulty]) {
		const breakers = candidates.filter((c) => c.cursesBroken > 0);
		if (breakers.length > 0) {
			const choice = difficulty === "hard" ? breakers[0] : pick(breakers);
			return { type: "play", path: choice.path };
		}
	}

	const n = candidates.length;
	let pool: Candidate[];
	if (difficulty === "hard") {
		pool = candidates.slice(0, 3);
	} else if (difficulty === "medium") {
		pool = candidates.slice(0, Math.max(1, Math.ceil(n * 0.25)));
	} else {
		// Easy: between the 30th and 60th percentile of scores.
		const from = Math.floor(n * 0.3);
		pool = candidates.slice(from, Math.max(from + 1, Math.ceil(n * 0.6)));
	}
	return { type: "play", path: pick(pool).path };
}

/** What a bot needs from its room. */
export interface BotHost {
	gameOf(seatId: string): GameState | null;
	/** Applies the move; false once the bot can no longer play (match over, knocked out). */
	botMove(seatId: string, action: GameAction): boolean;
}

/** Plays moves on a timer until the match ends. Returns a function that stops the bot. */
export function startBot(
	host: BotHost,
	seatId: string,
	difficulty: BotDifficulty,
	words: WordList,
	random: () => number = Math.random,
): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const act = () => {
		const game = host.gameOf(seatId);
		if (!game || game.status !== "playing") return;
		if (host.botMove(seatId, chooseMove(game.board, words, difficulty, random)))
			schedule();
	};
	const schedule = () => {
		timer = setTimeout(act, thinkingMs(difficulty, random));
	};
	schedule();
	return () => clearTimeout(timer);
}
