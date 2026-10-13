// Validates game states that come from outside the engine (saved games, later the network).
import { z } from "zod";
import { CELL_COUNT, LETTER_WEIGHTS } from "./config";
import type { GameState, Letter } from "./types";

const letter = z.enum(Object.keys(LETTER_WEIGHTS) as [Letter, ...Letter[]]);
const id = z.number().int().nonnegative();
const uint32 = z.number().int().min(0).max(0xffffffff);

const stone = z.discriminatedUnion("kind", [
	z.object({ id, letter, kind: z.literal("rune") }),
	z.object({ id, letter, kind: z.literal("curse") }),
	z.object({
		id,
		letter,
		kind: z.literal("crystal"),
		tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
	}),
]);

export const GameStateSchema = z.object({
	version: z.literal(1),
	mode: z.enum(["classic", "action"]),
	seed: z.string().min(1),
	rng: z.tuple([uint32, uint32, uint32, uint32]),
	nextId: id,
	board: z.array(stone.nullable()).length(CELL_COUNT),
	score: z.number().int().nonnegative(),
	level: z.number().int().min(1),
	wordsPlayed: z.number().int().nonnegative(),
	prophecy: z.object({ word: z.string(), fulfilled: z.boolean() }),
	pastProphecies: z.array(z.string()),
	bestWord: z
		.object({ word: z.string(), score: z.number().int().nonnegative() })
		.nullable(),
	status: z.enum(["playing", "over"]),
});

/** A valid game state, or null for anything else (old formats, hand-edited data, junk). */
export function parseGameState(value: unknown): GameState | null {
	const result = GameStateSchema.safeParse(value);
	return result.success ? result.data : null;
}
