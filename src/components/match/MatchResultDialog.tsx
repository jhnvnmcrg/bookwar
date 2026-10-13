import { useEffect, useRef } from "react";
import { Button } from "#/components/ui/button";
import type { MatchMode, MatchResult, Standing } from "#/shared/protocol";
import { Nox } from "../brand/Nox";

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

function duelOutcome(result: MatchResult, you: string | null) {
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
	return { title, reason, happy: won, draw };
}

function siegeOutcome(result: MatchResult, you: string | null) {
	const mine = result.standings.find((s) => s.seatId === you);
	const winner = result.standings.find((s) => s.seatId === result.winnerSeatId);
	const won = mine !== undefined && mine.seatId === winner?.seatId;
	return {
		title: won
			? "You win the siege!"
			: mine
				? `You placed ${ORDINALS[mine.place - 1]}`
				: "Siege over",
		reason: won
			? "You're the last wizard standing."
			: `${winner?.name ?? "A rival"} is the last wizard standing.`,
		happy: won,
		draw: false,
	};
}

/** How a Siege player's game ended, e.g. "Cut in round 2". */
function fate(standing: Standing): string {
	if (!standing.out) return "Last standing";
	const round = standing.outRound ? ` in round ${standing.outRound}` : "";
	if (standing.out === "cut") return `Cut${round}`;
	if (standing.out === "tower") return `Tower fell${round}`;
	return `Left${round}`;
}

export function MatchResultDialog({
	mode,
	result,
	you,
	onRematch,
	onLeave,
}: {
	mode: MatchMode;
	result: MatchResult;
	you: string | null;
	onRematch: () => void;
	onLeave: () => void;
}) {
	const rematch = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		rematch.current?.focus();
	}, []);
	const outcome =
		mode === "siege" ? siegeOutcome(result, you) : duelOutcome(result, you);

	return (
		<div className="fixed inset-0 z-20 grid place-items-center bg-lapis-deep/80 p-4 backdrop-blur-[2px]">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="match-result-title"
				className="w-full max-w-sm rounded-lg bg-lapis-raised p-6 ring-1 ring-gold/40"
			>
				<Nox
					mood={outcome.draw ? "idle" : outcome.happy ? "wow" : "sad"}
					className="mx-auto h-24 w-20"
				/>
				<h2
					id="match-result-title"
					className="mt-2 text-center font-stone text-3xl font-bold text-vellum"
				>
					{outcome.title}
				</h2>
				<p className="mt-1 text-center text-vellum-dim">{outcome.reason}</p>
				<ol className="mt-5 text-sm">
					{result.standings.map((entry) => (
						<li
							key={entry.seatId}
							className="grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-x-2 border-t border-gold/20 py-2"
						>
							<span className="figures text-vellum-dim">
								{ORDINALS[entry.place - 1]}
							</span>
							<span
								className={
									entry.seatId === you ? "text-gold-bright" : "text-vellum"
								}
							>
								{entry.name}
								{entry.seatId === you && " (you)"}
								{mode === "siege" && (
									<span className="block text-xs text-vellum-dim">
										{fate(entry)}
									</span>
								)}
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
