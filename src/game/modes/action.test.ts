import { describe, expect, it } from "vitest";
import { ACTION_SHUFFLE_DROPS, CELL_COUNT, ROWS } from "../config";
import { Dictionary } from "../dictionary/dictionary";
import { findWords } from "../finder";
import { rowOf, toIndex } from "../hex";
import { createGame, reduce } from "../reducer";
import {
	actionWith,
	boardFromRows,
	classicWith,
	down,
	stoneCount,
} from "../test-utils";
import type { GameAction, GameEvent, GameState, ReduceResult } from "../types";
import { dropInterval } from "./action";

const words = new Dictionary(["cat", "cats", "wizard", "eee"]);
const EMPTY = ". . . . . . .";
const FULL = "e e e e e e e";

function expectOk(result: ReduceResult) {
	if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
	return result;
}

const has = (events: readonly GameEvent[], type: GameEvent["type"]) =>
	events.some((event) => event.type === type);

/** "cats" on top of column 0's stack, a half-filled board elsewhere. */
const halfBoard = () =>
	boardFromRows([
		EMPTY,
		EMPTY,
		EMPTY,
		EMPTY,
		"c e e e e e e",
		"a e e e e e e",
		"t e e e e e e",
		"s e e e e e e",
	]);

describe("Action: a new game", () => {
	it("starts with the bottom half of every column filled", () => {
		const game = createGame({ mode: "action", seed: "start" });
		expect(stoneCount(game.board)).toBe(CELL_COUNT / 2);
		game.board.forEach((cell, index) => {
			expect(cell !== null).toBe(rowOf(index) >= ROWS / 2);
		});
		expect(
			game.board.every((cell) => cell === null || cell.kind === "rune"),
		).toBe(true);
	});

	it("is the same for the same seed", () => {
		expect(createGame({ mode: "action", seed: "x" })).toEqual(
			createGame({ mode: "action", seed: "x" }),
		);
	});
});

describe("Action: words", () => {
	it("remove stones without refilling", () => {
		const state = actionWith(halfBoard());
		const { state: next, events } = expectOk(
			reduce(state, { type: "play", path: down(0, 4, 3) }, words),
		);
		expect(next.score).toBe(50);
		expect(stoneCount(next.board)).toBe(stoneCount(state.board) - 3);
		// "s" stays at the bottom of column 0; nothing new arrived.
		expect(next.board[toIndex(0, 7)]).toEqual(state.board[toIndex(0, 7)]);
		expect(next.board[toIndex(0, 6)]).toBeNull();
		expect(has(events, "stones-dropped")).toBe(false);
	});

	it("drop a crystal onto the column a long word ended in", () => {
		const state = actionWith(
			boardFromRows([
				EMPTY,
				EMPTY,
				"w . . . . . .",
				"i . . . . . .",
				"z e e e e e e",
				"a e e e e e e",
				"r e e e e e e",
				"d e e e e e e",
			]),
		);
		const { state: next, events } = expectOk(
			reduce(state, { type: "play", path: down(0, 2, 6) }, words),
		);
		const crystal = next.board[toIndex(0, 7)];
		expect(crystal).toMatchObject({ kind: "crystal", tier: 2, id: 1000 });
		expect(stoneCount(next.board)).toBe(stoneCount(state.board) - 6 + 1);
		expect(has(events, "crystal-formed")).toBe(true);
	});
});

describe("Action: the clock", () => {
	it("drops one stone on top of a column", () => {
		const state = actionWith(halfBoard());
		const { state: next, events } = expectOk(
			reduce(state, { type: "tick" }, words),
		);
		expect(stoneCount(next.board)).toBe(stoneCount(state.board) + 1);
		const landed = next.board.findIndex((cell) => cell?.id === 1000);
		expect(rowOf(landed)).toBe(3);
		expect(events).toEqual([{ type: "stones-dropped", ids: [1000] }]);
		expect(next.nextId).toBe(1001);
	});

	it("buries the tower when a stone has nowhere to land", () => {
		const state = actionWith(boardFromRows(Array(ROWS).fill(FULL)));
		const { state: next, events } = expectOk(
			reduce(state, { type: "tick" }, words),
		);
		expect(next.status).toBe("over");
		expect(has(events, "buried")).toBe(true);
		expect(reduce(next, { type: "tick" }, words)).toEqual({
			ok: false,
			error: "game-over",
		});
	});

	it("speeds up with level, down to a floor", () => {
		expect(dropInterval(1)).toBe(2400);
		expect(dropInterval(2)).toBeLessThan(dropInterval(1));
		expect(dropInterval(50)).toBe(700);
	});

	it("is ignored by Classic games", () => {
		const classic = classicWith(boardFromRows(Array(ROWS).fill(FULL)));
		expect(reduce(classic, { type: "tick" }, words)).toEqual({
			ok: false,
			error: "wrong-mode",
		});
	});
});

describe("Action: shuffle spell", () => {
	it("redraws runes and drops extra stones instead of a curse", () => {
		const state = actionWith(halfBoard());
		const { state: next, events } = expectOk(
			reduce(state, { type: "shuffle" }, words),
		);
		expect(stoneCount(next.board)).toBe(
			stoneCount(state.board) + ACTION_SHUFFLE_DROPS,
		);
		expect(next.board.some((cell) => cell?.kind === "curse")).toBe(false);
		expect(has(events, "shuffled")).toBe(true);
		const oldIds = state.board.flatMap((cell) => (cell ? [cell.id] : []));
		const newIds = next.board.flatMap((cell) => (cell ? [cell.id] : []));
		expect(newIds).toEqual(expect.arrayContaining(oldIds));
	});

	it("can bury the tower when there isn't room for the extra stones", () => {
		const rows = Array(ROWS).fill(FULL);
		rows[0] = "e e e e e e .";
		const { state: next } = expectOk(
			reduce(actionWith(boardFromRows(rows)), { type: "shuffle" }, words),
		);
		expect(next.status).toBe("over");
	});
});

describe("Action: whole games", () => {
	it("replays identically and never makes curses", () => {
		const run = () => {
			let state: GameState = createGame({ mode: "action", seed: "replay" });
			for (let turn = 0; turn < 60 && state.status === "playing"; turn++) {
				const [best] = findWords(state.board, words);
				const action: GameAction =
					turn % 3 === 0 || !best
						? { type: "tick" }
						: { type: "play", path: best.path };
				state = expectOk(reduce(state, action, words)).state;
				expect(state.board.some((cell) => cell?.kind === "curse")).toBe(false);
			}
			return state;
		};
		expect(run()).toEqual(run());
	});
});
