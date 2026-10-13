// Action mode: no curses and no refill. The clock keeps dropping stones onto the board; the
// game ends when a stone has nowhere to land.
import {
	collapse,
	createPartialBoard,
	dropStone,
	redrawRunes,
	removeStones,
} from "../board";
import {
	ACTION_DROP_MIN_MS,
	ACTION_DROP_SPEEDUP,
	ACTION_DROP_START_MS,
	ACTION_SHUFFLE_DROPS,
	ACTION_START_ROWS,
} from "../config";
import { colOf } from "../hex";
import { pickProphecy } from "../levels";
import { checkPath } from "../path";
import { Rng } from "../rng";
import { crystalTierFor } from "../specials";
import type {
	Board,
	GameAction,
	GameEvent,
	GameState,
	ReduceResult,
	WordList,
} from "../types";
import { scoreMove } from "./shared";

/** Milliseconds between dropped stones at a level. */
export function dropInterval(level: number): number {
	return Math.max(
		ACTION_DROP_MIN_MS,
		Math.round(ACTION_DROP_START_MS * ACTION_DROP_SPEEDUP ** (level - 1)),
	);
}

export function createActionGame(seed: string): GameState {
	const rng = Rng.fromSeed(seed);
	const { board, nextId } = createPartialBoard(rng, 1, ACTION_START_ROWS);
	const prophecy = pickProphecy(rng, []);
	return {
		version: 1,
		mode: "action",
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

export function reduceAction(
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
		case "tick":
			return drop(state, new Rng(state.rng), [], 1);
	}
}

/**
 * Score the word → remove its stones → the stones above fall (nothing refills) → a long word
 * drops a crystal onto the column where it ended.
 */
function playWord(
	state: GameState,
	path: readonly number[],
	words: WordList,
): ReduceResult {
	const check = checkPath(state.board, path, words);
	if (!check.ok) return check;

	const rng = new Rng(state.rng);
	const { word, stones } = check;
	const { fields, events } = scoreMove(state, word, path, stones, rng);
	let board: Board = collapse(removeStones(state.board, path));
	let nextId = state.nextId;

	const tier = crystalTierFor(word.length);
	if (tier) {
		const id = nextId++;
		// The word's last stone came out of this column, so there is always room.
		const landed = dropStone(
			board,
			rng,
			(letter) => ({ id, letter, kind: "crystal", tier }),
			colOf(path[path.length - 1]),
		);
		if (landed) {
			board = landed.board;
			events.push({ type: "crystal-formed", id, tier });
		}
	}

	return {
		ok: true,
		state: { ...state, ...fields, rng: rng.state, nextId, board },
		events,
	};
}

/** Shuffle spell: every plain rune gets a new letter, at the cost of extra falling stones. */
function shuffle(state: GameState): ReduceResult {
	const rng = new Rng(state.rng);
	const shuffled = { ...state, board: redrawRunes(state.board, rng) };
	return drop(shuffled, rng, [{ type: "shuffled" }], ACTION_SHUFFLE_DROPS);
}

/** Drops `count` stones onto random columns with room. One that can't land buries the tower. */
function drop(
	state: GameState,
	rng: Rng,
	events: GameEvent[],
	count: number,
): ReduceResult {
	let board = state.board;
	let nextId = state.nextId;
	const ids: number[] = [];
	let buried = false;
	for (let i = 0; i < count; i++) {
		const id = nextId;
		const landed = dropStone(board, rng, (letter) => ({
			id,
			letter,
			kind: "rune",
		}));
		if (!landed) {
			buried = true;
			break;
		}
		nextId++;
		board = landed.board;
		ids.push(id);
	}
	if (ids.length > 0) events.push({ type: "stones-dropped", ids });
	if (buried) events.push({ type: "buried" });
	return {
		ok: true,
		state: {
			...state,
			rng: rng.state,
			nextId,
			board,
			status: buried ? "over" : "playing",
		},
		events,
	};
}
