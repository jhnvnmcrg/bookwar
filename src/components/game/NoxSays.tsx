import { Nox } from "../brand/Nox";
import type { NoxLine } from "./nox-lines";

/** Nox with a speech bubble. Also the screen-reader announcement for each move. */
export function NoxSays({ line }: { line: NoxLine }) {
	return (
		<div className="flex items-end gap-3">
			<Nox
				mood={line.mood}
				className="h-20 w-[4.3rem] shrink-0 lg:h-28 lg:w-24"
			/>
			<div className="relative mb-3 rounded-lg bg-lapis-raised px-3 py-2 text-[0.95rem] leading-snug text-vellum ring-1 ring-gold/25">
				<span
					aria-hidden="true"
					className="absolute bottom-3 -left-1.5 size-3 rotate-45 bg-lapis-raised"
				/>
				<p className="sr-only">Nox says:</p>
				<p aria-live="polite">{line.text}</p>
			</div>
		</div>
	);
}
