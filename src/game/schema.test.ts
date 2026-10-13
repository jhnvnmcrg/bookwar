import { describe, expect, it } from "vitest";
import { createGame } from "./reducer";
import { parseGameState } from "./schema";

describe("parseGameState", () => {
	it("accepts real games after a JSON round trip", () => {
		for (const mode of ["classic", "action"] as const) {
			const game = createGame({ mode, seed: "schema" });
			expect(parseGameState(JSON.parse(JSON.stringify(game)))).toEqual(game);
		}
	});

	it("rejects anything that isn't a valid game", () => {
		const game = createGame({ mode: "classic", seed: "schema" });
		const broken = [
			null,
			"save",
			{},
			{ ...game, version: 2 },
			{ ...game, mode: "siege" },
			{ ...game, board: game.board.slice(1) },
			{ ...game, score: -5 },
			{ ...game, rng: [1, 2, 3] },
			{
				...game,
				board: game.board.map((cell, i) =>
					i === 0 ? { ...cell, letter: "q" } : cell,
				),
			},
			{
				...game,
				board: game.board.map((cell, i) =>
					i === 0 ? { ...cell, kind: "crystal" } : cell,
				),
			},
		];
		for (const value of broken) expect(parseGameState(value)).toBeNull();
	});
});
