// Server functions for accounts and leaderboards. Everything that reads or changes a player's
// data goes through the `signedIn` middleware, which checks their login token.
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { hasDatabase } from "#/db";
import {
	type Leaderboard,
	MAX_IMPORT,
	ScoreUploadSchema,
} from "#/shared/accounts";
import { nameProblem, tidyName } from "#/shared/names";
import { withinLimit } from "../rate-limit.server";
import { signedIn } from "./auth-middleware";
import {
	accountView,
	ensureProfile,
	importScores,
	leaderboard,
	renameProfile,
	ScoreRejected,
	submitScore,
} from "./records.server";

/** Games a player may have checked per minute (each one is replayed move by move). */
const REPLAYS_PER_MINUTE = 40;

function allowReplays(userId: string, count: number): void {
	if (!withinLimit(`replay:${userId}`, count, REPLAYS_PER_MINUTE, 60_000))
		throw new Error("Too many scores at once. Try again in a minute.");
}

/**
 * Called after signing in: makes sure the account has a wizard name (the guest name if it
 * had none) and brings in this browser's local high scores.
 */
export const syncAccount = createServerFn({ method: "POST" })
	.middleware([signedIn])
	.validator(
		z.object({
			nickname: z.string().max(40),
			scores: z.array(ScoreUploadSchema).max(MAX_IMPORT),
		}),
	)
	.handler(async ({ data, context }) => {
		const { userId, name } = context.user;
		const nickname = await ensureProfile(userId, [data.nickname, name]);
		if (data.scores.length === 0) return { nickname, imported: 0, verified: 0 };
		allowReplays(userId, data.scores.length);
		return { nickname, ...(await importScores(userId, data.scores)) };
	});

export const renameWizard = createServerFn({ method: "POST" })
	.middleware([signedIn])
	.validator(z.object({ nickname: z.string().max(40) }))
	.handler(async ({ data, context }) => {
		const nickname = tidyName(data.nickname);
		if (nameProblem(nickname)) throw new Error("Pick a different name.");
		if (!withinLimit(`rename:${context.user.userId}`, 1, 10, 60_000))
			throw new Error("Too many name changes. Try again in a minute.");
		await renameProfile(context.user.userId, nickname);
		return { nickname };
	});

/** A Solo game a signed-in player just finished. The server replays it before saving. */
export const submitSoloScore = createServerFn({ method: "POST" })
	.middleware([signedIn])
	.validator(ScoreUploadSchema)
	.handler(async ({ data, context }) => {
		const { userId, name } = context.user;
		allowReplays(userId, 1);
		await ensureProfile(userId, [name]);
		try {
			return await submitScore(userId, data);
		} catch (error) {
			if (error instanceof ScoreRejected) throw new Error(error.message);
			throw error;
		}
	});

export const getMyAccount = createServerFn({ method: "GET" })
	.middleware([signedIn])
	.handler(async ({ context }) => {
		setResponseHeader("Cache-Control", "private, no-store");
		const { userId, name } = context.user;
		const nickname = await ensureProfile(userId, [name]);
		return accountView(userId, nickname);
	});

const EMPTY_BOARD: Leaderboard = {
	classic: [],
	action: [],
	duel: [],
	siege: [],
};

/** Public: the same for everyone. */
export const getLeaderboard = createServerFn({ method: "GET" }).handler(
	async () => {
		if (!hasDatabase()) return EMPTY_BOARD;
		setResponseHeader("Cache-Control", "public, max-age=30");
		return leaderboard();
	},
);
