import {
	collapseAndRefill,
	countCurses,
	createBoard,
	hasCurseOnBottomRow,
	redrawRunes,
	removeStones,
	sinkCurses,
	withCrystal,
	withCurse,
} from "../board";
import { MAX_CURSES_FROM_WORDS } from "../config";
import { rowOf } from "../hex";
import { levelForScore, pickProphecy, prophecyBonus, rankFor } from "../levels";
import { checkPath } from "../path";
import { Rng } from "../rng";
import { scoreWord } from "../scoring";
import { crystalTierFor, curseChance, higherTier } from "../specials";
import type {
	Board,
	CrystalTier,
	GameAction,
	GameEvent,
	GameState,
	ReduceResult,
	WordList,
} from "../types";

export function createClassicGame(seed: string): GameState {
	const rng = Rng.fromSeed(seed);
	const { board, nextId } = createBoard(rng, 1);
	const prophecy = pickProphecy(rng, []);
	return {
		version: 1,
		mode: "classic",
		seed,
		rng: rng.state,
		nextId,
		board,
		score: 0,
		level: 1,
		wordsPlayed: 0,
		prophecy: { word: prophecy, fulfilled: false },
		pastProphecies: [prophecy],
		bestWord: null,
		status: "playing",
	};
}

export function reduceClassic(
	state: GameState,
	action: GameAction,
	words: WordList,
): ReduceResult {
	if (state.status !== "playing") return { ok: false, error: "game-over" };
	switch (action.type) {
		case "play":
			return playWord(state, action.path, words);
		case "shuffle":
			return shuffle(state);
	}
}

/**
 * Order after a word: score it (prophecy, level-up) → remove its stones → stones fall → new
 * stones drop in (a new curse can only appear among these) → crystal → curses sink one row →
 * a curse on the bottom row makes the tower fall.
 */
function playWord(
	state: GameState,
	path: readonly number[],
	words: WordList,
): ReduceResult {
	const check = checkPath(state.board, path, words);
	if (!check.ok) return check;

	const rng = new Rng(state.rng);
	const events: GameEvent[] = [];
	const { word, stones } = check;
	const letters = word.length;

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

	const refill = collapseAndRefill(
		removeStones(state.board, path),
		rng,
		state.nextId,
	);
	let board = refill.board;

	if (
		refill.added.length > 0 &&
		countCurses(board) < MAX_CURSES_FROM_WORDS &&
		rng.chance(curseChance(level, letters))
	) {
		const index = rng.pick(refill.added);
		board = withCurse(board, index);
		const curse = board[index];
		if (curse) events.push({ type: "curse-appeared", id: curse.id });
	}

	const tier = crystalTierFor(letters);
	if (tier) {
		const placed = placeCrystal(
			board,
			path[path.length - 1],
			tier,
			refill.added,
		);
		if (placed) {
			board = placed.board;
			events.push({ type: "crystal-formed", id: placed.id, tier: placed.tier });
		}
	}

	const sink = sinkCurses(board);
	board = sink.board;
	if (sink.sunk.length > 0)
		events.push({ type: "curses-sank", ids: sink.sunk });

	const towerFell = hasCurseOnBottomRow(board);
	if (towerFell) events.push({ type: "tower-fell" });

	const best = state.bestWord;
	return {
		ok: true,
		state: {
			...state,
			rng: rng.state,
			nextId: refill.nextId,
			board,
			score,
			level,
			wordsPlayed: state.wordsPlayed + 1,
			prophecy,
			pastProphecies,
			bestWord:
				!best || wordScore.total > best.score
					? { word, score: wordScore.total }
					: best,
			status: towerFell ? "over" : "playing",
		},
		events,
	};
}

/**
 * The crystal forms on the stone that fell into the word's last cell. If that one is a curse,
 * it goes to the first new stone instead. An existing crystal keeps the higher tier.
 */
function placeCrystal(
	board: Board,
	lastIndex: number,
	tier: CrystalTier,
	added: readonly number[],
): { board: Board; id: number; tier: CrystalTier } | null {
	for (const index of [lastIndex, ...added]) {
		const stone = board[index];
		if (!stone || stone.kind === "curse") continue;
		const best = stone.kind === "crystal" ? higherTier(stone.tier, tier) : tier;
		return { board: withCrystal(board, index, best), id: stone.id, tier: best };
	}
	return null;
}

/** Shuffle spell: every plain rune gets a new letter, at the cost of a curse in the top row. */
function shuffle(state: GameState): ReduceResult {
	const rng = new Rng(state.rng);
	const events: GameEvent[] = [{ type: "shuffled" }];
	let board = redrawRunes(state.board, rng);

	const topRunes: number[] = [];
	board.forEach((cell, index) => {
		if (cell?.kind === "rune" && rowOf(index) === 0) topRunes.push(index);
	});
	if (topRunes.length > 0) {
		const index = rng.pick(topRunes);
		board = withCurse(board, index);
		const curse = board[index];
		if (curse) events.push({ type: "curse-appeared", id: curse.id });
	}

	return { ok: true, state: { ...state, rng: rng.state, board }, events };
}
