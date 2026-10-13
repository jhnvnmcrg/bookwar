import { type Board, ROWS } from "#/game";
import { nearestCurse } from "./nox-lines";

/**
 * The tower as a column of floors, one per board row. The lowest curse is marked on the
 * floor it has sunk to; the bottom floor is where it topples the tower.
 */
export function CurseMeter({ board }: { board: Board }) {
	const rows = nearestCurse(board);
	const curseRow = rows === null ? null : ROWS - 1 - rows;
	const label =
		rows === null
			? "No curses on the board."
			: rows === 1
				? "The nearest curse is one row from the bottom."
				: `The nearest curse is ${rows} rows from the bottom.`;

	return (
		<section aria-label="Tower" className="flex items-center gap-3">
			<div aria-hidden="true" className="flex w-5 flex-col gap-0.5">
				{Array.from({ length: ROWS }, (_, row) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: floors are fixed positions
						key={row}
						className={`h-2.5 rounded-[2px] ${
							row === curseRow
								? rows !== null && rows <= 2
									? "bg-rubric"
									: "bg-curse-glow"
								: row === ROWS - 1
									? "bg-rubric/35"
									: "bg-vellum/15"
						}`}
					/>
				))}
			</div>
			<p
				className={`text-sm ${rows !== null && rows <= 2 ? "text-rubric" : "text-vellum-dim"}`}
			>
				{label}
			</p>
		</section>
	);
}
