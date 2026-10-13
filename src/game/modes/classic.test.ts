import { beforeAll, describe, expect, it } from "vitest";
import { ROWS } from "../config";
import { Dictionary, loadDictionary } from "../dictionary";
import { findWords } from "../finder";
import { rowOf, toIndex } from "../hex";
import { createGame, reduce } from "../reducer";
import {
	boardFromRows,
	cells,
	classicWith,
	deepFreeze,
	down,
} from "../test-utils";
import type { GameEvent, GameState, ReduceResult } from "../types";

const words = new Dictionary(["cat", "cats", "wizard", "wizards"]);

/** "cats" down column 0, everything else "e". */
const catsBoard = (extra: Record<number, string> = {}) => {
	const rows = ["c", "a", "t", "s", "e", "e", "e", "e"].map(
		(letter) => `${letter} e e e e e e`,
	);
	for (const [row, line] of Object.entries(extra)) rows[Number(row)] = line;
	return boardFromRows(rows);
};
const CAT = cells([0, 0], [0, 1], [0, 2]);

function expectOk(result: ReduceResult) {
	if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
	return result;
}

const eventOf = <T extends GameEvent["type"]>(
	events: readonly GameEvent[],
	type: T,
) =>
	events.find(
		(event): event is Extract<GameEvent, { type: T }> => event.type === type,
	);

const positionOf = (state: GameState, id: number) =>
	state.board.findIndex((cell) => cell?.id === id);

describe("Classic: playing a word", () => {
	it("scores it, removes its stones and refills the board", () => {
		const state = classicWith(
			boardFromRows([
				"w e e e e e e",
				"i e e e e e e",
				"z e e e e e e",
				"a e e e e e e",
				"r e e e e e e",
				"d e e e e e e",
				"c e e e e e e",
				"a e e e e e e",
			]),
		);
		const path = down(0, 0, 6);
		const { state: next, events } = expectOk(
			reduce(state, { type: "play", path }, words),
		);

		expect(next.score).toBe(475);
		expect(next.wordsPlayed).toBe(1);
		expect(next.bestWord).toEqual({ word: "wizard", score: 475 });
		expect(next.board.every((cell) => cell !== null)).toBe(true);
		const usedIds = path.map((index) => state.board[index]?.id);
		expect(next.board.some((cell) => usedIds.includes(cell?.id))).toBe(false);
		// The two stones below the word stayed at the bottom.
		expect(next.board[toIndex(0, 6)]).toEqual(state.board[toIndex(0, 6)]);
		expect(next.board[toIndex(0, 7)]).toEqual(state.board[toIndex(0, 7)]);
		expect(eventOf(events, "word")).toMatchObject({
			word: "wizard",
			score: 475,
		});
	});

	it("leaves a crystal sized to the word", () => {
		const state = classicWith(
			boardFromRows([
				"w e e e e e e",
				"i e e e e e e",
				"z e e e e e e",
				"a e e e e e e",
				"r e e e e e e",
				"d e e e e e e",
				"s e e e e e e",
				"e e e e e e e",
			]),
		);
		const six = expectOk(
			reduce(state, { type: "play", path: down(0, 0, 6) }, words),
		);
		const seven = expectOk(
			reduce(state, { type: "play", path: down(0, 0, 7) }, words),
		);
		const crystals = (s: GameState) =>
			s.board.filter((cell) => cell?.kind === "crystal");
		expect(crystals(six.state)).toEqual([expect.objectContaining({ tier: 2 })]);
		expect(crystals(seven.state)).toEqual([
			expect.objectContaining({ tier: 3 }),
		]);
		expect(eventOf(seven.events, "crystal-formed")?.tier).toBe(3);
	});

	it("rejects invalid moves and leaves the state alone", () => {
		const state = classicWith(catsBoard());
		expect(
			reduce(
				state,
				{ type: "play", path: cells([1, 0], [1, 1], [1, 2]) },
				words,
			),
		).toEqual({
			ok: false,
			error: "not-a-word",
		});
	});

	it("never mutates the state it is given", () => {
		const state = deepFreeze(classicWith(catsBoard()));
		const snapshot = structuredClone(state);
		expectOk(reduce(state, { type: "play", path: CAT }, words));
		expectOk(reduce(state, { type: "shuffle" }, words));
		expect(state).toEqual(snapshot);
	});
});

describe("Classic: curse runes", () => {
	it("sink one row per word", () => {
		const state = classicWith(catsBoard({ 2: "t e e e !e e e" }));
		const curseId = state.board[toIndex(4, 2)]?.id ?? -1;
		const { state: next, events } = expectOk(
			reduce(state, { type: "play", path: CAT }, words),
		);
		expect(positionOf(next, curseId)).toBe(toIndex(4, 3));
		expect(eventOf(events, "curses-sank")?.ids).toContain(curseId);
		expect(next.status).toBe("playing");
	});

	it("break when used in a word", () => {
		const state = classicWith(catsBoard({ 1: "!a e e e e e e" }));
		const curseId = state.board[toIndex(0, 1)]?.id ?? -1;
		const { state: next, events } = expectOk(
			reduce(state, { type: "play", path: CAT }, words),
		);
		expect(positionOf(next, curseId)).toBe(-1);
		expect(eventOf(events, "word")?.cursesBroken).toBe(1);
	});

	it("make the tower fall when one reaches the bottom row", () => {
		const state = classicWith(catsBoard({ [ROWS - 2]: "e e e e !e e e" }));
		const { state: next, events } = expectOk(
			reduce(state, { type: "play", path: CAT }, words),
		);
		expect(next.status).toBe("over");
		expect(eventOf(events, "tower-fell")).toBeDefined();
		expect(reduce(next, { type: "play", path: CAT }, words)).toEqual({
			ok: false,
			error: "game-over",
		});
		expect(reduce(next, { type: "shuffle" }, words)).toEqual({
			ok: false,
			error: "game-over",
		});
	});
});

describe("Classic: prophecy and levels", () => {
	it("pays the prophecy bonus once", () => {
		const state = classicWith(catsBoard(), {
			prophecy: { word: "cat", fulfilled: false },
		});
		const { state: next, events } = expectOk(
			reduce(state, { type: "play", path: CAT }, words),
		);
		expect(eventOf(events, "prophecy-fulfilled")).toEqual({
			type: "prophecy-fulfilled",
			word: "cat",
			bonus: 750,
		});
		expect(next.score).toBe(50 + 750);
		expect(next.prophecy).toEqual({ word: "cat", fulfilled: true });
	});

	it("levels up with a new rank and a new prophecy", () => {
		const state = classicWith(catsBoard(), { score: 990 });
		const { state: next, events } = expectOk(
			reduce(state, { type: "play", path: CAT }, words),
		);
		expect(next.level).toBe(2);
		expect(eventOf(events, "level-up")).toMatchObject({
			level: 2,
			rank: "Initiate",
		});
		expect(next.prophecy.fulfilled).toBe(false);
		expect(next.pastProphecies).toHaveLength(state.pastProphecies.length + 1);
		expect(next.pastProphecies.at(-1)).toBe(next.prophecy.word);
	});
});

describe("Classic: shuffle spell", () => {
	it("redraws plain runes and costs a curse in the top row", () => {
		const state = classicWith(catsBoard({ 5: "e e e e e e a2" }));
		const { state: next, events } = expectOk(
			reduce(state, { type: "shuffle" }, words),
		);

		expect(eventOf(events, "shuffled")).toBeDefined();
		const curses = next.board
			.map((cell, index) => ({ cell, index }))
			.filter(({ cell }) => cell?.kind === "curse");
		expect(curses).toHaveLength(1);
		expect(rowOf(curses[0].index)).toBe(0);
		expect(eventOf(events, "curse-appeared")?.id).toBe(curses[0].cell?.id);
		expect(next.board[toIndex(6, 5)]).toEqual(state.board[toIndex(6, 5)]);
		expect(next.board.map((cell) => cell?.id)).toEqual(
			state.board.map((cell) => cell?.id),
		);
		expect(next.score).toBe(state.score);
	});
});

describe("Classic: whole games", () => {
	let dictionary: Dictionary;
	beforeAll(async () => {
		dictionary = await loadDictionary();
	});

	/** Plays the best word each turn, or shuffles when there is none. */
	function autoplay(seed: string, turns: number): GameState {
		let state = createGame({ mode: "classic", seed });
		for (let turn = 0; turn < turns && state.status === "playing"; turn++) {
			const [best] = findWords(state.board, dictionary, { maxLetters: 8 });
			const action = best
				? ({ type: "play", path: best.path } as const)
				: ({ type: "shuffle" } as const);
			state = expectOk(reduce(state, action, dictionary)).state;
		}
		return state;
	}

	it("replays identically from the same seed", () => {
		expect(autoplay("replay", 15)).toEqual(autoplay("replay", 15));
	});

	it("starts differently for different seeds", () => {
		const a = createGame({ mode: "classic", seed: "a" });
		const b = createGame({ mode: "classic", seed: "b" });
		expect(a.board.map((c) => c?.letter)).not.toEqual(
			b.board.map((c) => c?.letter),
		);
	});

	it("stays JSON-safe", () => {
		const state = autoplay("json", 10);
		expect(JSON.parse(JSON.stringify(state))).toEqual(state);
		expect(state.score).toBeGreaterThan(0);
	});
});
