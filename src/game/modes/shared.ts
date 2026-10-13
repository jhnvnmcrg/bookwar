// The part of a word that every mode scores the same way.
import { levelForScore, pickProphecy, prophecyBonus, rankFor } from "../levels";
import type { Rng } from "../rng";
import { scoreWord } from "../scoring";
import type { GameEvent, GameState, Stone } from "../types";

export type ScoredFields = Pick<
	GameState,
	"score" | "level" | "prophecy" | "pastProphecies" | "bestWord" | "wordsPlayed"
>;

/** Scores a played word: points, prophecy bonus, level-up (with a new prophecy) and best word. */
export function scoreMove(
	state: GameState,
	word: string,
	path: readonly number[],
	stones: readonly Stone[],
	rng: Rng,
): { fields: ScoredFields; events: GameEvent[] } {
	const events: GameEvent[] = [];
	const wordScore = scoreWord(stones);
	let score = state.score + wordScore.total;
	events.push({
		type: "word",
		word,
		path: [...path],
		score: wordScore.total,
		crystalMultiplier: wordScore.crystalMultiplier,
		cursesBroken: stones.filter((stone) => stone.kind === "curse").length,
	});

	let prophecy = state.prophecy;
	if (!prophecy.fulfilled && word === prophecy.word) {
		const bonus = prophecyBonus(state.level);
		score += bonus;
		prophecy = { word: prophecy.word, fulfilled: true };
		events.push({ type: "prophecy-fulfilled", word, bonus });
	}

	let level = state.level;
	let pastProphecies = state.pastProphecies;
	const reached = levelForScore(score);
	if (reached > level) {
		level = reached;
		const next = pickProphecy(rng, pastProphecies);
		prophecy = { word: next, fulfilled: false };
		pastProphecies = [...pastProphecies, next];
		events.push({
			type: "level-up",
			level,
			rank: rankFor(level),
			prophecy: next,
		});
	}

	const best = state.bestWord;
	return {
		fields: {
			score,
			level,
			prophecy,
			pastProphecies,
			wordsPlayed: state.wordsPlayed + 1,
			bestWord:
				!best || wordScore.total > best.score
					? { word, score: wordScore.total }
					: best,
		},
		events,
	};
}
