CREATE TABLE "high_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"score" integer NOT NULL,
	"level" integer NOT NULL,
	"words" integer NOT NULL,
	"best_word" text,
	"best_word_score" integer,
	"seed" text NOT NULL,
	"moves" jsonb,
	"verified" boolean NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"match_id" uuid NOT NULL,
	"seat" integer NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"bot" text,
	"score" integer NOT NULL,
	"place" integer NOT NULL,
	"won" boolean NOT NULL,
	"out_reason" text,
	"out_round" integer,
	CONSTRAINT "match_players_match_id_seat_pk" PRIMARY KEY("match_id","seat")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text NOT NULL,
	"code" text NOT NULL,
	"seconds" integer NOT NULL,
	"rounds" integer NOT NULL,
	"humans" integer NOT NULL,
	"end_reason" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "high_scores" ADD CONSTRAINT "high_scores_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "high_scores_user_game" ON "high_scores" USING btree ("user_id","mode","seed");--> statement-breakpoint
CREATE INDEX "high_scores_board" ON "high_scores" USING btree ("mode","score" DESC NULLS LAST) WHERE "high_scores"."verified";--> statement-breakpoint
CREATE INDEX "match_players_user" ON "match_players" USING btree ("user_id");