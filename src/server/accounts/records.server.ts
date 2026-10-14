// Database reads and writes behind accounts: profiles, Solo scores (checked by replaying the
// game) and match history. Server only; callers check who the player is first.
import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { highScores, matches, matchPlayers, profiles } from "../../db/schema";
import { loadDictionary } from "../../game/dictionary";
import { replayGame } from "../../game/replay";
import type { GameState } from "../../game/types";
import type {
	AccountView,
	Leaderboard,
	LeaderRow,
	MyMatch,
	ScoreUpload,
	SoloBoardMode,
	SubmitResult,
	WinsRow,
} from "../../shared/accounts";
import { nameProblem, tidyName } from "../../shared/names";
import type { MatchRecord } from "../realtime/hub";

/** Rows per leaderboard table. */
const BOARD_SIZE = 20;
const RECENT_MATCHES = 20;
const SCORES_PER_MODE = 10;

/** A usable wizard name from the candidates, or a plain default. */
function pickNickname(
	userId: string,
	candidates: readonly (string | null)[],
): string {
	for (const candidate of candidates) {
		if (!candidate) continue;
		const name = tidyName(candidate);
		if (!nameProblem(name)) return name;
	}
	return `Wizard ${userId.slice(0, 4).toUpperCase()}`;
}

/**
 * The account's wizard name. A new account takes the name the player already used as a
 * guest, else the name on their login, else a default.
 */
export async function ensureProfile(
	userId: string,
	candidates: readonly (string | null)[],
): Promise<string> {
	const db = getDb();
	await db
		.insert(profiles)
		.values({ userId, nickname: pickNickname(userId, candidates) })
		.onConflictDoNothing();
	const [row] = await db
		.select({ nickname: profiles.nickname })
		.from(profiles)
		.where(eq(profiles.userId, userId));
	return row.nickname;
}

/** Changes the wizard name. The caller has already checked it with `nameProblem`. */
export async function renameProfile(
	userId: string,
	nickname: string,
): Promise<void> {
	await getDb()
		.insert(profiles)
		.values({ userId, nickname })
		.onConflictDoUpdate({
			target: profiles.userId,
			set: { nickname, updatedAt: sql`now()` },
		});
}

// --- Solo scores ---------------------------------------------------------------------------

/** The finished game the moves lead to, or null when they don't replay to a finished game. */
async function replayUpload(upload: ScoreUpload): Promise<GameState | null> {
	if (!upload.moves) return null;
	const words = await loadDictionary();
	const result = replayGame(upload.mode, upload.seed, upload.moves, words);
	return result.ok && result.state.status === "over" ? result.state : null;
}

/** A game time the server is willing to store: not in the future, not before Bookwar. */
function playedAt(iso: string): Date {
	const date = new Date(iso);
	const now = Date.now();
	return date.getTime() > now || date.getTime() < Date.UTC(2026, 0, 1)
		? new Date(now)
		: date;
}

type ScoreRow = typeof highScores.$inferInsert;

function verifiedRow(
	userId: string,
	upload: ScoreUpload,
	state: GameState,
): ScoreRow {
	return {
		userId,
		mode: upload.mode,
		seed: upload.seed,
		score: state.score,
		level: state.level,
		words: state.wordsPlayed,
		bestWord: state.bestWord?.word ?? null,
		bestWordScore: state.bestWord?.score ?? null,
		moves: upload.moves ?? null,
		verified: true,
		playedAt: playedAt(upload.playedAt),
	};
}

/**
 * Saves a game; sending the same game (same seed) again keeps the better record: a checked
 * score beats an unchecked one, then the higher score wins.
 */
async function upsertScore(row: ScoreRow): Promise<void> {
	await getDb()
		.insert(highScores)
		.values(row)
		.onConflictDoUpdate({
			target: [highScores.userId, highScores.mode, highScores.seed],
			set: {
				score: sql`excluded.score`,
				level: sql`excluded.level`,
				words: sql`excluded.words`,
				bestWord: sql`excluded.best_word`,
				bestWordScore: sql`excluded.best_word_score`,
				moves: sql`excluded.moves`,
				verified: sql`excluded.verified`,
				playedAt: sql`excluded.played_at`,
			},
			setWhere: sql`excluded.verified > ${highScores.verified} or (excluded.verified = ${highScores.verified} and excluded.score > ${highScores.score})`,
		});
}

/** Where the player's best checked score stands among everyone's best (1 = top). */
async function placeOf(userId: string, mode: SoloBoardMode): Promise<number> {
	const db = getDb();
	const checked = and(eq(highScores.mode, mode), eq(highScores.verified, true));
	const [mine] = await db
		.select({ best: sql<number>`max(${highScores.score})`.mapWith(Number) })
		.from(highScores)
		.where(and(checked, eq(highScores.userId, userId)));
	const bests = db
		.select({
			userId: highScores.userId,
			best: sql<number>`max(${highScores.score})`.as("best"),
		})
		.from(highScores)
		.where(checked)
		.groupBy(highScores.userId)
		.as("bests");
	const [ahead] = await db
		.select({ n: count() })
		.from(bests)
		.where(sql`${bests.best} > ${mine?.best ?? 0}`);
	return ahead.n + 1;
}

export class ScoreRejected extends Error {}

/** A game just finished by a signed-in player: replay it, then keep the checked score. */
export async function submitScore(
	userId: string,
	upload: ScoreUpload,
): Promise<SubmitResult> {
	const state = await replayUpload(upload);
	if (!state) throw new ScoreRejected("That game couldn't be checked.");
	await upsertScore(verifiedRow(userId, upload, state));
	return { score: state.score, place: await placeOf(userId, upload.mode) };
}

/**
 * A guest's local high scores, brought into their account. Games with a move log are
 * replayed and count for the leaderboard; older ones without a log are kept for the player's
 * own list only. A log that doesn't replay is dropped.
 */
export async function importScores(
	userId: string,
	uploads: readonly ScoreUpload[],
): Promise<{ readonly imported: number; readonly verified: number }> {
	let imported = 0;
	let verified = 0;
	for (const upload of uploads) {
		const state = await replayUpload(upload);
		if (state) {
			await upsertScore(verifiedRow(userId, upload, state));
			verified++;
		} else if (!upload.moves) {
			await upsertScore({
				userId,
				mode: upload.mode,
				seed: upload.seed,
				score: upload.score,
				level: upload.level,
				words: upload.words,
				bestWord: upload.bestWord?.word ?? null,
				bestWordScore: upload.bestWord?.score ?? null,
				moves: null,
				verified: false,
				playedAt: playedAt(upload.playedAt),
			});
		} else {
			continue;
		}
		imported++;
	}
	return { imported, verified };
}

// --- Matches -------------------------------------------------------------------------------

/** Stores a finished Duel or Siege. Signed-in players get a profile if they had none. */
export async function recordMatch(record: MatchRecord): Promise<void> {
	await getDb().transaction(async (tx) => {
		for (const player of record.players) {
			if (!player.userId) continue;
			await tx
				.insert(profiles)
				.values({
					userId: player.userId,
					nickname: pickNickname(player.userId, [player.name]),
				})
				.onConflictDoNothing();
		}
		const [match] = await tx
			.insert(matches)
			.values({
				mode: record.mode,
				code: record.code,
				seconds: record.seconds,
				rounds: record.rounds,
				humans: record.players.filter((player) => !player.bot).length,
				endReason: record.reason,
				startedAt: new Date(record.startedAt),
				endedAt: new Date(record.endedAt),
			})
			.returning({ id: matches.id });
		await tx.insert(matchPlayers).values(
			record.players.map((player) => ({
				matchId: match.id,
				seat: player.seat,
				userId: player.userId,
				name: player.name,
				bot: player.bot,
				score: player.score,
				place: player.place,
				won: player.won,
				outReason: player.out,
				outRound: player.outRound,
			})),
		);
	});
}

// --- Reading ---------------------------------------------------------------------------------

async function topScores(mode: SoloBoardMode): Promise<LeaderRow[]> {
	const db = getDb();
	// Each player's best checked game; ties go to whoever played it first.
	const best = db
		.selectDistinctOn([highScores.userId], {
			userId: highScores.userId,
			score: highScores.score,
			level: highScores.level,
			bestWord: highScores.bestWord,
			playedAt: highScores.playedAt,
		})
		.from(highScores)
		.where(and(eq(highScores.mode, mode), eq(highScores.verified, true)))
		.orderBy(
			highScores.userId,
			desc(highScores.score),
			asc(highScores.playedAt),
		)
		.as("best");
	const rows = await db
		.select({
			nickname: profiles.nickname,
			score: best.score,
			level: best.level,
			bestWord: best.bestWord,
			playedAt: best.playedAt,
		})
		.from(best)
		.innerJoin(profiles, eq(profiles.userId, best.userId))
		.orderBy(desc(best.score), asc(best.playedAt))
		.limit(BOARD_SIZE);
	return rows.map((row, i) => ({
		place: i + 1,
		nickname: row.nickname,
		score: row.score,
		level: row.level,
		bestWord: row.bestWord,
		playedAt: row.playedAt.toISOString(),
	}));
}

/** Most wins against other people; AI-only matches don't count here. */
async function topWins(mode: "duel" | "siege"): Promise<WinsRow[]> {
	const wins = sql<number>`count(*) filter (where ${matchPlayers.won})`.mapWith(
		Number,
	);
	const rows = await getDb()
		.select({ nickname: profiles.nickname, wins, played: count() })
		.from(matchPlayers)
		.innerJoin(matches, eq(matches.id, matchPlayers.matchId))
		.innerJoin(profiles, eq(profiles.userId, matchPlayers.userId))
		.where(and(eq(matches.mode, mode), gte(matches.humans, 2)))
		.groupBy(profiles.userId, profiles.nickname)
		.having(sql`count(*) filter (where ${matchPlayers.won}) > 0`)
		.orderBy(desc(wins), asc(count()), asc(profiles.nickname))
		.limit(BOARD_SIZE);
	return rows.map((row, i) => ({ place: i + 1, ...row }));
}

export async function leaderboard(): Promise<Leaderboard> {
	const [classic, action, duel, siege] = await Promise.all([
		topScores("classic"),
		topScores("action"),
		topWins("duel"),
		topWins("siege"),
	]);
	return { classic, action, duel, siege };
}

/** Everything the account page shows: the player's scores, record and recent matches. */
export async function accountView(
	userId: string,
	nickname: string,
): Promise<AccountView> {
	const db = getDb();
	const scoreRows = await db
		.select()
		.from(highScores)
		.where(eq(highScores.userId, userId))
		.orderBy(desc(highScores.score), asc(highScores.playedAt));
	const perMode = { classic: 0, action: 0 };
	const scores = scoreRows
		.filter((row) => perMode[row.mode]++ < SCORES_PER_MODE)
		.map((row) => ({
			mode: row.mode,
			score: row.score,
			level: row.level,
			bestWord: row.bestWord,
			verified: row.verified,
			playedAt: row.playedAt.toISOString(),
		}));

	const totals = await db
		.select({
			mode: matches.mode,
			played: count(),
			won: sql<number>`count(*) filter (where ${matchPlayers.won})`.mapWith(
				Number,
			),
		})
		.from(matchPlayers)
		.innerJoin(matches, eq(matches.id, matchPlayers.matchId))
		.where(eq(matchPlayers.userId, userId))
		.groupBy(matches.mode);
	const record = {
		duel: { played: 0, won: 0 },
		siege: { played: 0, won: 0 },
	};
	for (const row of totals)
		record[row.mode] = { played: row.played, won: row.won };

	const mine = await db
		.select({
			id: matches.id,
			mode: matches.mode,
			humans: matches.humans,
			endedAt: matches.endedAt,
			seat: matchPlayers.seat,
			place: matchPlayers.place,
			won: matchPlayers.won,
			score: matchPlayers.score,
		})
		.from(matchPlayers)
		.innerJoin(matches, eq(matches.id, matchPlayers.matchId))
		.where(eq(matchPlayers.userId, userId))
		.orderBy(desc(matches.endedAt))
		.limit(RECENT_MATCHES);
	const others =
		mine.length === 0
			? []
			: await db
					.select({
						matchId: matchPlayers.matchId,
						seat: matchPlayers.seat,
						name: matchPlayers.name,
					})
					.from(matchPlayers)
					.where(
						inArray(
							matchPlayers.matchId,
							mine.map((match) => match.id),
						),
					)
					.orderBy(asc(matchPlayers.place));
	const recent: MyMatch[] = mine.map((match) => ({
		id: match.id,
		mode: match.mode,
		place: match.place,
		won: match.won,
		draw: match.mode === "duel" && match.place === 1 && !match.won,
		score: match.score,
		rivals: others
			.filter(
				(other) => other.matchId === match.id && other.seat !== match.seat,
			)
			.map((other) => other.name),
		vsAi: match.humans < 2,
		endedAt: match.endedAt.toISOString(),
	}));

	return { nickname, scores, record, matches: recent };
}
