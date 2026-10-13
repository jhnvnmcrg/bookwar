import { type Board, nearestCurse } from "#/game";
import type { SeatView } from "#/shared/protocol";
import { MiniBoard } from "./MiniBoard";

const DIFFICULTY = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

function status(
	seat: SeatView,
	board: Board | undefined,
): { text: string; danger: boolean } {
	if (seat.out === "tower") return { text: "Their tower fell.", danger: false };
	if (seat.out === "left")
		return { text: "They left the duel.", danger: false };
	if (!seat.connected) return { text: "Reconnecting…", danger: true };
	const curse = board ? nearestCurse(board) : null;
	if (curse === null)
		return { text: "No curses on their board.", danger: false };
	return {
		text:
			curse === 1
				? "A curse is one row from their bottom."
				: `Their nearest curse is ${curse} rows from the bottom.`,
		danger: curse <= 2,
	};
}

/** The rival: name, score and a small view of their board. */
export function OpponentCard({
	seat,
	board,
}: {
	seat: SeatView;
	board: Board | undefined;
}) {
	const line = status(seat, board);
	return (
		<section aria-label={`Rival: ${seat.name}`} className="flex gap-4 lg:block">
			<div className="w-16 shrink-0 lg:mb-3 lg:w-40">
				{board ? (
					<MiniBoard board={board} label={`${seat.name}'s board`} />
				) : (
					<div className="aspect-[594/780] rounded-md bg-lapis-deep/60" />
				)}
			</div>
			<div className="min-w-0">
				<p className="text-sm text-vellum-dim">
					Rival{seat.bot ? `, AI (${DIFFICULTY[seat.bot]})` : ""}
				</p>
				<p className="truncate font-stone text-xl font-bold text-vellum">
					{seat.name}
				</p>
				<p className="figures text-2xl font-bold text-gold-bright lg:text-3xl">
					{seat.score.toLocaleString("en-US")}
				</p>
				<p
					className={`mt-1 text-sm ${line.danger ? "text-rubric" : "text-vellum-dim"}`}
				>
					{line.text}
				</p>
			</div>
		</section>
	);
}
