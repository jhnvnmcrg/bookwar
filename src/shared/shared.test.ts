import { describe, expect, it } from "vitest";
import { createGame } from "../game/reducer";
import { boardFromRows } from "../game/test-utils";
import { nameProblem, tidyName } from "./names";
import {
	ClientMessageSchema,
	decodeMini,
	encodeMini,
	PROTOCOL_VERSION,
	toPublicState,
} from "./protocol";

describe("player names", () => {
	it("tidies whitespace", () => {
		expect(tidyName("  Ann   the  Bold ")).toBe("Ann the Bold");
	});

	it("accepts ordinary names, including accents and real names with rude substrings", () => {
		for (const name of [
			"Ann",
			"Élodie",
			"Nox the 2nd",
			"Hancock",
			"Dickens",
			"O'Brien",
			"x_y-z",
		]) {
			expect(nameProblem(name), name).toBeNull();
		}
	});

	it("rejects bad lengths, characters and words", () => {
		expect(nameProblem("A")).toBe("too-short");
		expect(nameProblem("A".repeat(17))).toBe("too-long");
		expect(nameProblem("f*ck")).toBe("bad-characters");
		expect(nameProblem(" leading")).toBe("bad-characters");
		for (const name of [
			"fuck",
			"xXfuckXx",
			"fu_ck",
			"sh1t head",
			"Big Bitch",
			"nazi",
		]) {
			expect(nameProblem(name), name).toBe("not-allowed");
		}
	});
});

describe("protocol", () => {
	it("round-trips a board through the compact opponent form", () => {
		const board = boardFromRows([
			"c a t . . . .",
			"!e qu s2 . . . .",
			"e e e e e e e",
			"e e e e e e e",
			"e e e e e e e",
			"e e e e e e e",
			"e e e e e e e",
			"e e e e e e e",
		]);
		const decoded = decodeMini(encodeMini(board));
		expect(
			decoded.map(
				(c) => c && [c.kind, c.letter, c.kind === "crystal" ? c.tier : 0],
			),
		).toEqual(
			board.map(
				(c) => c && [c.kind, c.letter, c.kind === "crystal" ? c.tier : 0],
			),
		);
	});

	it("hides seeds and random state from public games", () => {
		const view = toPublicState(createGame({ mode: "classic", seed: "secret" }));
		expect(Object.keys(view)).not.toEqual(expect.arrayContaining(["seed"]));
		expect(JSON.stringify(view)).not.toContain("secret");
		expect(view).not.toHaveProperty("rng");
	});

	it("validates client messages", () => {
		const ok = (value: unknown) => ClientMessageSchema.safeParse(value).success;
		expect(
			ok({
				type: "hello",
				v: PROTOCOL_VERSION,
				guestId: "g".repeat(20),
				nickname: "Ann",
			}),
		).toBe(true);
		expect(ok({ type: "createRoom", durationSec: 180, bot: "hard" })).toBe(
			true,
		);
		expect(ok({ type: "createRoom", durationSec: 999 })).toBe(false);
		expect(ok({ type: "joinRoom", code: "ABCD1" })).toBe(false);
		expect(ok({ type: "joinRoom", code: "ABCDE" })).toBe(true);
		expect(ok({ type: "play", seq: 1, path: [] })).toBe(false);
		expect(ok({ type: "play", seq: 1, path: [1.5] })).toBe(false);
	});
});
