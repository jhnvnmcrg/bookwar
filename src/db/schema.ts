// Drizzle tables for Bookwar accounts: profiles, solo high scores and match history.
// Accounts themselves (users, sessions) live in Neon Auth's own `neon_auth` schema; `user_id`
// here is the id from that schema (the `sub` of the player's login token).
import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
	timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** The public side of an account: the wizard name on leaderboards and in matches. */
export const profiles = pgTable("profiles", {
	userId: uuid("user_id").primaryKey(),
	nickname: text("nickname").notNull(),
	createdAt: createdAt(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

/**
 * Finished Solo games. `verified` games were replayed on the server from their seed and moves;
 * the others were imported from a browser's local high scores without a move log.
 */
export const highScores = pgTable(
	"high_scores",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => profiles.userId, { onDelete: "cascade" }),
		mode: text("mode", { enum: ["classic", "action"] }).notNull(),
		score: integer("score").notNull(),
		level: integer("level").notNull(),
		words: integer("words").notNull(),
		bestWord: text("best_word"),
		bestWordScore: integer("best_word_score"),
		seed: text("seed").notNull(),
		moves: jsonb("moves").$type<string[]>(),
		verified: boolean("verified").notNull(),
		playedAt: timestamp("played_at", { withTimezone: true }).notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		// One game per seed: sending the same game twice keeps the better result.
		uniqueIndex("high_scores_user_game").on(
			table.userId,
			table.mode,
			table.seed,
		),
		index("high_scores_board")
			.on(table.mode, table.score.desc())
			.where(sql`${table.verified}`),
	],
);

/** A finished Duel or Siege with at least one signed-in player. */
export const matches = pgTable("matches", {
	id: uuid("id").primaryKey().defaultRandom(),
	mode: text("mode", { enum: ["duel", "siege"] }).notNull(),
	code: text("code").notNull(),
	/** Match length (Duel) or round length (Siege), in seconds. */
	seconds: integer("seconds").notNull(),
	rounds: integer("rounds").notNull(),
	/** How many seats were people rather than AI rivals. */
	humans: integer("humans").notNull(),
	endReason: text("end_reason").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
});

export const matchPlayers = pgTable(
	"match_players",
	{
		matchId: uuid("match_id")
			.notNull()
			.references(() => matches.id, { onDelete: "cascade" }),
		seat: integer("seat").notNull(),
		/** Signed-in players only; guests and AI rivals have none. */
		userId: uuid("user_id").references(() => profiles.userId, {
			onDelete: "set null",
		}),
		name: text("name").notNull(),
		bot: text("bot", { enum: ["easy", "medium", "hard"] }),
		score: integer("score").notNull(),
		place: integer("place").notNull(),
		won: boolean("won").notNull(),
		outReason: text("out_reason"),
		outRound: integer("out_round"),
	},
	(table) => [
		primaryKey({ columns: [table.matchId, table.seat] }),
		index("match_players_user").on(table.userId),
	],
);
