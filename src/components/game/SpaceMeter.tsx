import { type Board, CELL_COUNT } from "#/game";
import type { DropClock } from "#/hooks/useSoloGame";
import { emptyCells, LOW_SPACE } from "./nox-lines";

/** Action mode: how much room is left before falling stones bury the tower. */
export function SpaceMeter({ board }: { board: Board }) {
	const space = emptyCells(board);
	const low = space <= LOW_SPACE;
	return (
		<section aria-label="Space left">
			<p className={`text-sm ${low ? "text-rubric" : "text-vellum-dim"}`}>
				{space === 0
					? "No room left. The next stone buries your tower."
					: `${space} of ${CELL_COUNT} spaces left`}
			</p>
			<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-lapis-deep/80">
				<div
					className={`h-full rounded-full transition-[width] duration-300 ${low ? "bg-rubric" : "bg-verdigris"}`}
					style={{ width: `${(space / CELL_COUNT) * 100}%` }}
				/>
			</div>
		</section>
	);
}

/** Action mode: a gold bar above the board that empties until the next stone falls. */
export function DropTimer({
	clock,
	running,
}: {
	clock: DropClock;
	running: boolean;
}) {
	return (
		<div
			role="timer"
			aria-label="Time until the next stone falls"
			className="mx-2 mb-2 h-1 overflow-hidden rounded-full bg-lapis-deep/80"
		>
			<div
				key={clock.key}
				className="drop-timer h-full rounded-full bg-gold"
				style={{
					animationDuration: `${clock.durationMs}ms`,
					animationPlayState: running ? "running" : "paused",
				}}
			/>
		</div>
	);
}
