import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Button } from "#/components/ui/button";
import { type GameState, rankFor } from "#/game";
import { Nox } from "../brand/Nox";

const format = (value: number) => value.toLocaleString("en-US");

export function GameOver({
	game,
	onPlayAgain,
}: {
	game: GameState;
	onPlayAgain: () => void;
}) {
	const playAgain = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		playAgain.current?.focus();
	}, []);

	return (
		<div className="fixed inset-0 z-20 grid place-items-center bg-lapis-deep/80 p-4 backdrop-blur-[2px]">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="game-over-title"
				className="w-full max-w-sm rounded-lg bg-lapis-raised p-6 ring-1 ring-gold/40"
			>
				<Nox mood="sad" className="mx-auto h-24 w-20" />
				<h2
					id="game-over-title"
					className="mt-2 text-center font-stone text-3xl font-bold text-vellum"
				>
					Your tower has fallen
				</h2>
				<p className="mt-1 text-center text-vellum-dim">
					A curse sank to the bottom row.
				</p>
				<p className="figures mt-5 text-center text-5xl font-bold text-gold-bright">
					{format(game.score)}
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
						<Link to="/">Title screen</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
