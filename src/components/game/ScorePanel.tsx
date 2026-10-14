import { useRef, useState } from "react";
import { type GameState, rankFor, scoreForLevel } from "#/game";
import { gsap, prefersReducedMotion, useGSAP } from "#/lib/gsap";

const format = (value: number) => value.toLocaleString("en-US");

/** The score, counting up to each new total. GSAP owns the text after the first render. */
function Score({ value }: { value: number }) {
	const ref = useRef<HTMLSpanElement>(null);
	const counter = useRef({ value });
	const [first] = useState(() => format(value));
	useGSAP(
		() => {
			const element = ref.current;
			if (!element) return;
			const show = () => {
				element.textContent = format(Math.round(counter.current.value));
			};
			if (prefersReducedMotion() || value < counter.current.value) {
				gsap.killTweensOf(counter.current);
				counter.current.value = value;
				show();
				return;
			}
			gsap.to(counter.current, {
				value,
				duration: 0.6,
				ease: "power1.out",
				overwrite: true,
				onUpdate: show,
			});
		},
		{ dependencies: [value] },
	);
	return <span ref={ref}>{first}</span>;
}

/** Score, rank and progress to the next rank. */
export function ScorePanel({
	game,
}: {
	game: Pick<GameState, "score" | "level" | "bestWord" | "wordsPlayed">;
}) {
	const floor = scoreForLevel(game.level);
	const ceiling = scoreForLevel(game.level + 1);
	const progress = Math.min(1, (game.score - floor) / (ceiling - floor));
	const nextRank = rankFor(game.level + 1);

	return (
		<section
			aria-label="Score"
			className="flex flex-wrap items-end gap-x-6 gap-y-2 lg:block"
		>
			<div>
				<p className="text-sm text-vellum-dim">Score</p>
				<p className="figures text-4xl leading-none font-bold text-gold-bright lg:text-5xl">
					<Score value={game.score} />
				</p>
			</div>
			<div className="min-w-44 flex-1 lg:mt-6">
				<p className="font-stone text-2xl leading-tight font-bold text-vellum">
					{rankFor(game.level)}
				</p>
				<p className="text-sm text-vellum-dim">Level {game.level}</p>
				<div
					className="mt-2 h-1.5 overflow-hidden rounded-full bg-lapis-deep/80"
					role="progressbar"
					aria-label={`Progress to ${nextRank}`}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(progress * 100)}
				>
					<div
						className="h-full rounded-full bg-gold transition-[width] duration-500"
						style={{ width: `${progress * 100}%` }}
					/>
				</div>
				<p className="mt-1 text-sm text-vellum-dim">
					{nextRank === rankFor(game.level)
						? `${format(ceiling - game.score)} to level ${game.level + 1}`
						: `${format(ceiling - game.score)} to ${nextRank}`}
				</p>
			</div>
			<dl className="hidden text-sm lg:mt-8 lg:block">
				<div className="flex justify-between gap-4 border-t border-gold/20 py-2">
					<dt className="text-vellum-dim">Best word</dt>
					<dd className="font-stone text-vellum uppercase tracking-wider">
						{game.bestWord
							? `${game.bestWord.word} ${format(game.bestWord.score)}`
							: "None yet"}
					</dd>
				</div>
				<div className="flex justify-between gap-4 border-t border-gold/20 py-2">
					<dt className="text-vellum-dim">Words cast</dt>
					<dd className="figures text-vellum">{game.wordsPlayed}</dd>
				</div>
			</dl>
		</section>
	);
}
