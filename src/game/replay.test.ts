import { beforeAll, describe, expect, it } from "vitest";
import { type Dictionary, loadDictionary } from "./dictionary";
import { findWords } from "./finder";
import { createGame, reduce } from "./reducer";
import {
	decodeMove,
	encodeMove,
	MAX_MOVES,
	type MoveRecord,
	replayGame,
} from "./replay";
import type { GameAction, GameMode, GameState } from "./types";

let words: Dictionary;
beforeAll(async () => {
	words = await loadDictionary();
});

/** Plays a whole game the quick way (short words, a drop now and then) and logs every move. */
function playOut(mode: GameMode, seed: string) {
	let state: GameState = createGame({ mode, seed });
	const moves: MoveRecord[] = [];
	const apply = (action: GameAction) => {
		const result = reduce(state, action, words);
		if (!result.ok) throw new Error(result.error);
		state = result.state;
		moves.push(encodeMove(action));
	};
	for (let turn = 0; state.status === "playing" && turn < 2000; turn++) {
		// Action: nine drops for every word, so the stones pile up and the game ends.
		if (mode === "action" && turn % 10 !== 0) {
			apply({ type: "tick" });
			continue;
		}
		const shortest = findWords(state.board, words).sort(
			(a, b) => a.path.length - b.path.length || a.word.localeCompare(b.word),
		)[0];
		apply(
			shortest ? { type: "play", path: shortest.path } : { type: "shuffle" },
		);
	}
	return { state, moves };
}

describe("move log", () => {
	it("round-trips every kind of move", () => {
		const actions: GameAction[] = [
			{ type: "tick" },
			{ type: "shuffle" },
			{ type: "play", path: [0, 1, 9] },
			{ type: "play", path: [55, 47, 46, 38] },
		];
		for (const action of actions)
			expect(decodeMove(encodeMove(action))).toEqual(action);
		expect(encodeMove({ type: "play", path: [0, 10, 55] })).toBe("0At");
	});

	it("rejects entries that aren't moves", () => {
		for (const move of ["", "x", "0", "0~", "0z", "0".repeat(57)])
			expect(decodeMove(move)).toBeNull();
	});
});

describe("replayGame", () => {
	it("rebuilds a finished Classic game exactly", () => {
		const { state, moves } = playOut("classic", "replay-classic");
		expect(state.status).toBe("over");
		expect(replayGame("classic", "replay-classic", moves, words)).toEqual({
			ok: true,
			state,
		});
	});

	it("rebuilds a finished Action game exactly, falling stones included", () => {
		const { state, moves } = playOut("action", "replay-action");
		expect(state.status).toBe("over");
		expect(moves).toContain("t");
		expect(replayGame("action", "replay-action", moves, words)).toEqual({
			ok: true,
			state,
		});
	});

	it("points at the first move that doesn't fit the board", () => {
		const { moves } = playOut("classic", "replay-tamper");
		// The same moves on another seed's board stop making words quickly.
		const result = replayGame("classic", "another-seed", moves, words);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.at).toBeGreaterThanOrEqual(0);
	});

	it("refuses moves after the game is over, and falling stones in Classic", () => {
		const { moves } = playOut("classic", "replay-extra");
		expect(
			replayGame("classic", "replay-extra", [...moves, "s"], words),
		).toMatchObject({ ok: false, at: moves.length, error: "game-over" });
		expect(replayGame("classic", "replay-extra", ["t"], words)).toMatchObject({
			ok: false,
			at: 0,
			error: "wrong-mode",
		});
	});

	it("refuses logs that are too long or malformed", () => {
		expect(
			replayGame("action", "x", Array(MAX_MOVES + 1).fill("t"), words),
		).toEqual({ ok: false, at: -1, error: "too-long" });
		expect(replayGame("classic", "x", ["s", "??"], words)).toEqual({
			ok: false,
			at: 1,
			error: "bad-move",
		});
	});
});
