import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Button } from "#/components/ui/button";
import { type GameState, rankFor } from "#/game";
import { Nox } from "../brand/Nox";

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

function placeText(place: number | null): string {
	if (place === 1) return "Your best score yet!";
	if (place !== null) return `Number ${place} on your high scores.`;
	return "Not quite a high score this time.";
}

export function GameOver({
	game,
	place,
	onPlayAgain,
}: {
	game: GameState;
	/** Place on the local high-score list, or null if it didn't make the list. */
	place: number | null;
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
