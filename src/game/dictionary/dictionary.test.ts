import { beforeAll, describe, expect, it } from "vitest";
import { BLOCKED_WORDS } from "./blocklist";
import { Dictionary } from "./dictionary";
import { loadDictionary } from "./index";
import { PROPHECY_WORDS } from "./prophecy-words";

describe("Dictionary", () => {
	const small = Dictionary.fromText("cat\r\ncats\nwizard\n\n");

	it("parses LF and CRLF text", () => {
		expect(small.size).toBe(3);
		expect(small.has("cat")).toBe(true);
		expect(small.has("")).toBe(false);
	});

	it("answers prefix questions", () => {
		expect(small.hasPrefix("ca")).toBe(true);
		expect(small.hasPrefix("cats")).toBe(true);
		expect(small.hasPrefix("wiz")).toBe(true);
		expect(small.hasPrefix("catz")).toBe(false);
		expect(small.hasPrefix("zz")).toBe(false);
		expect(small.hasPrefix("a")).toBe(false);
	});
});

describe("the game word list", () => {
	let dictionary: Dictionary;
	beforeAll(async () => {
		dictionary = await loadDictionary();
	});

	it("loads the full list once", async () => {
		expect(dictionary.size).toBeGreaterThan(160_000);
		expect(await loadDictionary()).toBe(dictionary);
	});

	it("has everyday and arcane words", () => {
		for (const word of [
			"wizard",
			"rune",
			"tower",
			"curse",
			"spell",
			"quest",
			"qua",
		]) {
			expect(dictionary.has(word), word).toBe(true);
		}
		expect(dictionary.has("zzzx")).toBe(false);
	});

	it("contains no blocked words", () => {
		for (const word of BLOCKED_WORDS)
			expect(dictionary.has(word), word).toBe(false);
	});

	it("only has words the board can spell", async () => {
		const { default: text } = await import("./words.txt?raw");
		const lines = text.split("\n").filter((line) => line !== "");
		expect(text.includes("\r")).toBe(false);
		for (const word of lines) {
			if (!/^[a-z]{3,15}$/.test(word) || /q(?!u)/.test(word)) {
				throw new Error(`unplayable word in list: ${word}`);
			}
		}
	});
});

describe("prophecy words", () => {
	it("are unique 5–7 letter dictionary words that aren't blocked", async () => {
		const dictionary = await loadDictionary();
		expect(PROPHECY_WORDS.length).toBeGreaterThanOrEqual(250);
		expect(new Set(PROPHECY_WORDS).size).toBe(PROPHECY_WORDS.length);
		for (const word of PROPHECY_WORDS) {
			expect(word.length >= 5 && word.length <= 7, word).toBe(true);
			expect(dictionary.has(word), word).toBe(true);
			expect(BLOCKED_WORDS.has(word), word).toBe(false);
		}
	});
});
