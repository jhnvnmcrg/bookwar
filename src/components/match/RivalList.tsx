import { type Board, nearestCurse } from "#/game";
import type { SeatView } from "#/shared/protocol";
import { MiniBoard } from "./MiniBoard";

function status(seat: SeatView, board: Board | undefined, atRisk: boolean) {
	const round = seat.outRound ? ` in round ${seat.outRound}` : "";
	if (seat.out === "cut") return { text: `Cut${round}`, warn: false };
	if (seat.out === "tower") return { text: `Tower fell${round}`, warn: false };
	if (seat.out === "left") return { text: `Left${round}`, warn: false };
	if (!seat.connected) return { text: "Reconnecting…", warn: true };
	const curse = board ? nearestCurse(board) : null;
	if (curse !== null && curse <= 1)
		return { text: "Curse near the bottom", warn: true };
	if (atRisk) return { text: "Lowest score", warn: true };
	return { text: "", warn: false };
}

/**
 * Siege rivals, best score first, with the eliminated at the bottom. A compact strip on
 * phones; with small boards on wider screens.
 */
export function RivalList({
	rivals,
	boards,
	lowestScore,
}: {
	rivals: readonly SeatView[];
	boards: Readonly<Record<string, Board>>;
	/** The score that would be cut if the round ended now. */
	lowestScore: number | null;
}) {
	const ordered = [...rivals].sort(
		(a, b) =>
			Number(Boolean(a.out)) - Number(Boolean(b.out)) || b.score - a.score,
	);
	return (
		<section aria-label="Rivals">
			<h2 className="hidden text-sm text-vellum-dim lg:block">Rivals</h2>
			<ul className="flex flex-wrap gap-x-5 gap-y-1 lg:mt-1 lg:block">
				{ordered.map((seat) => {
					const board = boards[seat.seatId];
					const line = status(
						seat,
						board,
						!seat.out && seat.score === lowestScore,
					);
					return (
						<li
							key={seat.seatId}
							className={`flex items-center gap-2 lg:gap-3 lg:border-t lg:border-gold/15 lg:py-2 ${seat.out ? "opacity-50" : ""}`}
						>
							<div className="hidden w-12 shrink-0 lg:block">
								{board ? (
									<MiniBoard board={board} label={`${seat.name}'s board`} />
								) : (
									<div className="aspect-[594/780] rounded-sm bg-lapis-deep/60" />
								)}
							</div>
							<div className="min-w-0 lg:flex-1">
								<p className="font-stone leading-tight font-bold text-vellum lg:text-sm">
									{seat.name}
									{seat.bot && <span className="sr-only"> (AI)</span>}
								</p>
								{line.text && (
									<p
										className={`text-xs ${line.warn ? "text-rubric" : "text-vellum-dim"} ${line.warn || seat.out ? "" : "hidden lg:block"}`}
									>
										{line.text}
									</p>
								)}
							</div>
							<p className="figures font-bold text-gold-bright">
								{seat.score.toLocaleString("en-US")}
							</p>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
