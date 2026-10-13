import { beforeEach, describe, expect, it } from "vitest";
import { createGame } from "#/game";
import {
	clearSave,
	loadSave,
	loadScores,
	MAX_SCORES,
	recordScore,
	type ScoreEntry,
	type StorageLike,
	saveGame,
	scoreEntryFor,
} from "./guest-storage";

class MemoryStorage implements StorageLike {
	readonly data = new Map<string, string>();
	getItem(key: string) {
		return this.data.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		this.data.set(key, value);
	}
	removeItem(key: string) {
		this.data.delete(key);
	}
}

let storage: MemoryStorage;
beforeEach(() => {
	storage = new MemoryStorage();
});

const entry = (score: number, minute = 0): ScoreEntry => ({
	score,
	level: 1,
	words: 3,
	bestWord: null,
	playedAt: new Date(Date.UTC(2026, 9, 13, 12, minute)).toISOString(),
	seed: `s${score}`,
});

describe("saved games", () => {
	it("round-trips the exact game per mode", () => {
		const classic = createGame({ mode: "classic", seed: "a" });
		const action = createGame({ mode: "action", seed: "b" });
		saveGame(classic, storage);
		saveGame(action, storage);
		expect(loadSave("classic", storage)).toEqual(classic);
		expect(loadSave("action", storage)).toEqual(action);
		clearSave("classic", storage);
		expect(loadSave("classic", storage)).toBeNull();
		expect(loadSave("action", storage)).toEqual(action);
	});

	it("drops corrupt or unusable saves", () => {
		const finished = {
			...createGame({ mode: "classic", seed: "c" }),
			status: "over",
		};
		for (const text of [
			"{not json",
			'"hello"',
			"{}",
			JSON.stringify(finished),
		]) {
			storage.setItem("bookwar:v1:save:classic", text);
			expect(loadSave("classic", storage)).toBeNull();
			expect(storage.getItem("bookwar:v1:save:classic")).toBeNull();
		}
	});

	it("ignores a save filed under the wrong mode", () => {
		const action = createGame({ mode: "action", seed: "d" });
		storage.setItem("bookwar:v1:save:classic", JSON.stringify(action));
		expect(loadSave("classic", storage)).toBeNull();
	});

	it("works without storage at all", () => {
		expect(loadSave("classic", null)).toBeNull();
		expect(() =>
			saveGame(createGame({ mode: "classic", seed: "e" }), null),
		).not.toThrow();
		expect(loadScores("classic", null)).toEqual([]);
	});
});

describe("high scores", () => {
	it("keeps the best scores, highest first, and reports the place", () => {
		expect(recordScore("classic", entry(500), storage)).toBe(1);
		expect(recordScore("classic", entry(900), storage)).toBe(1);
		expect(recordScore("classic", entry(700), storage)).toBe(2);
		expect(loadScores("classic", storage).map((e) => e.score)).toEqual([
			900, 700, 500,
		]);
		expect(loadScores("action", storage)).toEqual([]);
	});

	it("keeps only the top ten", () => {
		for (let i = 1; i <= MAX_SCORES; i++)
			recordScore("action", entry(i * 100, i), storage);
		expect(recordScore("action", entry(50, 30), storage)).toBeNull();
		expect(recordScore("action", entry(5000, 31), storage)).toBe(1);
		const scores = loadScores("action", storage);
		expect(scores).toHaveLength(MAX_SCORES);
		expect(scores.at(-1)?.score).toBe(200);
	});

	it("puts the earlier game first on a tie", () => {
		recordScore("classic", entry(300, 5), storage);
		expect(recordScore("classic", entry(300, 9), storage)).toBe(2);
	});

	it("resets a corrupt list instead of failing", () => {
		storage.setItem("bookwar:v1:scores:classic", '[{"score":"lots"}]');
		expect(loadScores("classic", storage)).toEqual([]);
		expect(storage.getItem("bookwar:v1:scores:classic")).toBeNull();
		expect(recordScore("classic", entry(100), storage)).toBe(1);
	});

	it("builds an entry from a finished game", () => {
		const game = { ...createGame({ mode: "classic", seed: "f" }), score: 1234 };
		expect(scoreEntryFor(game, new Date(Date.UTC(2026, 0, 1)))).toEqual({
			score: 1234,
			level: 1,
			words: 0,
			bestWord: null,
			playedAt: "2026-01-01T00:00:00.000Z",
			seed: "f",
		});
	});
});
