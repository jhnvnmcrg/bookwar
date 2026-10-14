// Keeps a signed-in player's account and this browser in step: the wizard name, local high
// scores made as a guest, and games finished while signed in.
import type { GameMode } from "#/game";
import {
	renameWizard,
	submitSoloScore,
	syncAccount,
} from "#/server/accounts/account.functions";
import {
	MAX_IMPORT,
	type ScoreUpload,
	type SubmitResult,
} from "#/shared/accounts";
import { accessToken } from "./auth-client";
import { markUploaded, type ScoreEntry, scoresToUpload } from "./guest-storage";
import { loadProfile, type Profile, saveNickname } from "./profile";

const SOLO_MODES: readonly GameMode[] = ["classic", "action"];

function upload(mode: GameMode, entry: ScoreEntry): ScoreUpload {
	return {
		mode,
		seed: entry.seed,
		moves: entry.moves,
		score: entry.score,
		level: entry.level,
		words: entry.words,
		bestWord: entry.bestWord,
		playedAt: entry.playedAt,
	};
}

/** The message to show for a failed server call. */
export function problemText(error: unknown): string {
	return error instanceof Error && error.message
		? error.message
		: "Something went wrong. Try again.";
}

const syncs = new Map<string, Promise<{ nickname: string }>>();

/**
 * Once per page load and account: give the account a wizard name if it has none, bring in
 * this browser's high scores, and use the account's name here from now on.
 */
export function syncAccountOnce(userId: string): Promise<{ nickname: string }> {
	let sync = syncs.get(userId);
	if (!sync) {
		sync = (async () => {
			const games = scoresToUpload(userId, SOLO_MODES).slice(0, MAX_IMPORT);
			const result = await syncAccount({
				data: {
					nickname: loadProfile().nickname,
					scores: games.map((game) => upload(game.mode, game.entry)),
				},
			});
			markUploaded(
				userId,
				games.map((game) => ({ mode: game.mode, seed: game.entry.seed })),
			);
			saveNickname(result.nickname);
			return { nickname: result.nickname };
		})();
		// A failed sync is tried again next time instead of being remembered.
		sync.catch(() => syncs.delete(userId));
		syncs.set(userId, sync);
	}
	return sync;
}

const submissions = new Map<string, Promise<SubmitResult>>();

/** Sends a finished game to the leaderboard (once, however often the screen asks). */
export function submitGame(
	userId: string,
	mode: GameMode,
	entry: ScoreEntry,
): Promise<SubmitResult> {
	const key = `${userId}:${mode}:${entry.seed}`;
	let submission = submissions.get(key);
	if (!submission) {
		submission = submitSoloScore({ data: upload(mode, entry) }).then(
			(result) => {
				markUploaded(userId, [{ mode, seed: entry.seed }]);
				return result;
			},
		);
		submission.catch(() => submissions.delete(key));
		submissions.set(key, submission);
	}
	return submission;
}

/** Saves the wizard name here, and on the account too when signed in. */
export function rename(name: string): Profile {
	const profile = saveNickname(name);
	void (async () => {
		if (!(await accessToken())) return;
		await renameWizard({ data: { nickname: name } }).catch(() => {
			// The account keeps its old name; the next sign-in sync settles it.
		});
	})();
	return profile;
}
