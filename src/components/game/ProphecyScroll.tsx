import { type GameState, prophecyBonus } from "#/game";

/** This level's prophecy word, drawn as a vellum scroll. One line on phones. */
export function ProphecyScroll({
	game,
}: {
	game: Pick<GameState, "prophecy" | "level">;
}) {
	const { word, fulfilled } = game.prophecy;
	const bonus = `+${prophecyBonus(game.level).toLocaleString("en-US")}`;
	return (
		<section
			aria-label="Prophecy"
			className="relative mx-1.5 rounded-sm bg-vellum px-4 py-2 text-lapis-deep shadow-[0_6px_0_-2px_rgb(0_0_0/0.35)] lg:py-3"
		>
			<span
				aria-hidden="true"
				className="absolute inset-y-0 -left-1.5 w-3 rounded-full bg-[#cdbf9f]"
			/>
			<span
				aria-hidden="true"
				className="absolute inset-y-0 -right-1.5 w-3 rounded-full bg-[#cdbf9f]"
			/>
			<div className="flex items-baseline justify-between gap-3 lg:block">
				<p className="text-sm text-[#5b4b33]">Prophecy</p>
				<p
					className={`font-stone text-2xl leading-tight font-bold lg:text-3xl ${
						fulfilled
							? "text-[#7a6a4f] line-through decoration-2"
							: "text-lapis-deep"
					}`}
				>
					{word}
				</p>
				<p className="figures text-sm font-bold text-[#5b4b33] lg:hidden">
					{fulfilled ? "Fulfilled" : bonus}
				</p>
			</div>
			<p className="mt-1 hidden text-sm text-[#5b4b33] lg:block">
				{fulfilled
					? "Fulfilled. A new prophecy comes with the next level."
					: `Spell it this level for ${bonus}.`}
			</p>
		</section>
	);
}
