import { useEffect, useRef } from "react";
import { Button } from "#/components/ui/button";
import type { MatchResult } from "#/shared/protocol";
import { Nox } from "../brand/Nox";

function outcome(result: MatchResult, you: string | null) {
	const won = result.winnerSeatId === you;
	const draw = result.winnerSeatId === null;
	const title = draw ? "A draw" : won ? "You win!" : "You lost";
	const reason =
		result.reason === "time"
			? draw
				? "Time's up, and you're level."
				: "Time's up."
			: result.reason === "tower"
				? won
					? "Your rival's tower fell."
					: "A curse reached the bottom of your board."
				: won
					? "Your rival left the duel."
					: "You left the duel.";
	return {
		title,
		reason,
		mood: draw ? ("idle" as const) : won ? ("wow" as const) : ("sad" as const),
	};
}

export function DuelResult({
	result,
	you,
	onRematch,
	onLeave,
}: {
	result: MatchResult;
	you: string | null;
	onRematch: () => void;
	onLeave: () => void;
}) {
	const rematch = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		rematch.current?.focus();
	}, []);
	const { title, reason, mood } = outcome(result, you);

	return (
		<div className="fixed inset-0 z-20 grid place-items-center bg-lapis-deep/80 p-4 backdrop-blur-[2px]">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="duel-result-title"
				className="w-full max-w-sm rounded-lg bg-lapis-raised p-6 ring-1 ring-gold/40"
			>
				<Nox mood={mood} className="mx-auto h-24 w-20" />
				<h2
					id="duel-result-title"
					className="mt-2 text-center font-stone text-3xl font-bold text-vellum"
				>
					{title}
				</h2>
				<p className="mt-1 text-center text-vellum-dim">{reason}</p>
				<ol className="mt-5 text-sm">
					{result.standings.map((entry) => (
						<li
							key={entry.seatId}
							className="flex justify-between border-t border-gold/20 py-2"
						>
							<span
								className={
									entry.seatId === you ? "text-gold-bright" : "text-vellum"
								}
							>
								{entry.name}
								{entry.seatId === you && " (you)"}
							</span>
							<span className="figures font-bold">
								{entry.score.toLocaleString("en-US")}
							</span>
						</li>
					))}
				</ol>
				<div className="mt-6 flex gap-3">
					<Button
						ref={rematch}
						size="lg"
						className="flex-1 font-bold"
						onClick={onRematch}
					>
						Rematch
					</Button>
					<Button size="lg" variant="outline" onClick={onLeave}>
						Leave
					</Button>
				</div>
			</div>
		</div>
	);
}
