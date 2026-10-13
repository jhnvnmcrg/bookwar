import { beforeAll, describe, expect, it } from "vitest";
import { type Dictionary, loadDictionary } from "../../game/dictionary";
import { checkPath } from "../../game/path";
import { createGame } from "../../game/reducer";
import { Rng } from "../../game/rng";
import { boardFromRows } from "../../game/test-utils";
import { BOT_DIFFICULTIES } from "../../shared/protocol";
import { botCandidates, chooseMove, thinkingMs } from "./bot";

let dictionary: Dictionary;
beforeAll(async () => {
	dictionary = await loadDictionary();
});

describe("chooseMove", () => {
	it("always picks a legal word", () => {
		const random = Rng.fromSeed("bot-legal");
		for (const difficulty of BOT_DIFFICULTIES) {
			for (let i = 0; i < 5; i++) {
				const { board } = createGame({
					mode: "classic",
					seed: `${difficulty}-${i}`,
				});
				const move = chooseMove(board, dictionary, difficulty, () =>
					random.next(),
				);
				expect(move.type).toBe("play");
				if (move.type === "play") {
					expect(checkPath(board, move.path, dictionary).ok).toBe(true);
				}
			}
		}
	});

	it("keeps Hard among the best words and Easy away from them", () => {
		const { board } = createGame({ mode: "classic", seed: "levels" });
		const best = botCandidates(board, dictionary, "hard")
			.slice(0, 3)
			.map((c) => c.path);
		const random = Rng.fromSeed("levels");
		for (let i = 0; i < 10; i++) {
			const hard = chooseMove(board, dictionary, "hard", () => random.next());
			expect(best).toContainEqual(hard.type === "play" ? hard.path : null);
			const easy = chooseMove(board, dictionary, "easy", () => random.next());
			expect(best).not.toContainEqual(easy.type === "play" ? easy.path : null);
		}
	});

	it("goes after a curse about to reach the bottom (Medium and Hard)", () => {
		const rows = Array(8).fill("e e e e e e e");
		rows[3] = "c e e e e e e";
		rows[4] = "a e e e e e e";
		rows[5] = "t e e e e e e";
		rows[6] = "!s e e e e e e";
		const board = boardFromRows(rows);
		for (const difficulty of ["medium", "hard"] as const) {
			const move = chooseMove(board, dictionary, difficulty, () => 0.5);
			expect(move.type === "play" && move.path.includes(6)).toBe(true);
		}
	});

	it("shuffles when there's nothing to spell", () => {
		const board = boardFromRows(Array(8).fill("z z z z z z z"));
		expect(chooseMove(board, dictionary, "hard", () => 0.5)).toEqual({
			type: "shuffle",
		});
	});
});

describe("thinkingMs", () => {
	it("thinks longer on easier settings", () => {
		expect(thinkingMs("easy", () => 0)).toBe(7000);
		expect(thinkingMs("hard", () => 0.999)).toBeLessThanOrEqual(4000);
		expect(thinkingMs("medium", () => 0.5)).toBe(5500);
	});
});
