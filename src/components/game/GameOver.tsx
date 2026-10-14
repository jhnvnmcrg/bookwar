import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Button } from "#/components/ui/button";
import { type GameState, rankFor } from "#/game";
import type { LeaderboardStatus } from "#/hooks/useAccount";
import { ordinal } from "#/lib/ordinal";
import { Nox } from "../brand/Nox";
import { SOLO_MODES } from "./modes";

const format = (value: number) => value.toLocaleString("en-US");

const ENDINGS = {
	classic: {
		title: "Your tower has fallen",
		reason: "A curse sank to the bottom row.",
	},
	action: {
		title: "Your tower is buried",
		reason: "A falling stone had nowhere to land.",
	},
} as const;

const LINK = "text-gold-bright underline-offset-4 hover:underline";

/** What happened to this game on the leaderboard. */
function LeaderboardLine({
	status,
	mode,
}: {
	status: LeaderboardStatus;
	mode: GameState["mode"];
}) {
	const name = SOLO_MODES[mode].name;
	const line = "mt-2 text-center text-sm";
	switch (status.status) {
		case "none":
			return null;
		case "guest":
			return (
				<p className={`${line} text-vellum-dim`}>
					<Link to="/account" className={LINK}>
						Sign in
					</Link>{" "}
					to put your games on the leaderboard.
				</p>
			);
		case "unchecked":
			return (
				<p className={`${line} text-vellum-dim`}>
					This game began before scores were checked, so it stays off the
					leaderboard.
				</p>
			);
		case "saving":
			return (
				<p className={`${line} text-vellum-dim`} aria-live="polite">
					Checking your game for the leaderboard…
				</p>
			);
		case "saved":
			return (
				<p className={`${line} text-verdigris`} aria-live="polite">
					Checked. You're {ordinal(status.place)} on the{" "}
					<Link to="/leaderboard" search={{ board: mode }} className={LINK}>
						{name} leaderboard
					</Link>
					.
				</p>
			);
		case "failed":
			return (
				<p className={`${line} text-rubric`} aria-live="polite">
					Not added to the leaderboard. {status.message}
				</p>
			);
	}
}

function placeText(place: number | null): string {
	if (place === 1) return "Your best score yet!";
	if (place !== null) return `Number ${place} on your high scores.`;
	return "Not quite a high score this time.";
}

export function GameOver({
	game,
	place,
	leaderboard,
	onPlayAgain,
}: {
	game: GameState;
	/** Place on the local high-score list, or null if it didn't make the list. */
	place: number | null;
	leaderboard: LeaderboardStatus;
	onPlayAgain: () => void;
}) {
	const playAgain = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		playAgain.current?.focus();
	}, []);
	const ending = ENDINGS[game.mode];

	return (
		<div className="fixed inset-0 z-20 grid place-items-center bg-lapis-deep/80 p-4 backdrop-blur-[2px]">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="game-over-title"
				className="w-full max-w-sm rounded-lg bg-lapis-raised p-6 ring-1 ring-gold/40"
			>
				<Nox mood={place === 1 ? "wow" : "sad"} className="mx-auto h-24 w-20" />
				<h2
					id="game-over-title"
					className="mt-2 text-center font-stone text-3xl font-bold text-vellum"
				>
					{ending.title}
				</h2>
				<p className="mt-1 text-center text-vellum-dim">{ending.reason}</p>
				<p className="figures mt-5 text-center text-5xl font-bold text-gold-bright">
					{format(game.score)}
				</p>
				<p
					className={`mt-1 text-center text-sm ${place === 1 ? "text-gold-bright" : "text-vellum-dim"}`}
				>
					{placeText(place)}
				</p>
				<LeaderboardLine status={leaderboard} mode={game.mode} />
				<dl className="mt-5 text-sm">
					<div className="flex justify-between border-t border-gold/20 py-2">
						<dt className="text-vellum-dim">Rank</dt>
						<dd>
							{rankFor(game.level)}, level {game.level}
						</dd>
					</div>
					<div className="flex justify-between border-t border-gold/20 py-2">
						<dt className="text-vellum-dim">Best word</dt>
						<dd className="font-stone uppercase tracking-wider">
							{game.bestWord
								? `${game.bestWord.word} ${format(game.bestWord.score)}`
								: "None"}
						</dd>
					</div>
					<div className="flex justify-between border-t border-gold/20 py-2">
						<dt className="text-vellum-dim">Words cast</dt>
						<dd className="figures">{game.wordsPlayed}</dd>
					</div>
				</dl>
				<div className="mt-6 flex gap-3">
					<Button
						ref={playAgain}
						size="lg"
						className="flex-1 font-bold"
						onClick={onPlayAgain}
					>
						Play again
					</Button>
					<Button size="lg" variant="outline" asChild>
						<Link to="/scores">High scores</Link>
					</Button>
				</div>
				<p className="mt-4 text-center text-sm">
					<Link
						to="/"
						className="text-vellum-dim underline-offset-4 hover:underline"
					>
						Back to the title screen
					</Link>
				</p>
			</div>
		</div>
	);
}
