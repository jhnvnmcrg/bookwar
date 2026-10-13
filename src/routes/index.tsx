import { createFileRoute, Link } from "@tanstack/react-router";
import { Nox } from "#/components/brand/Nox";
import { TitleStones } from "#/components/brand/TitleStones";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/")({ component: Title });

const LATER_MODES = [
	{
		name: "Action",
		text: "Stones keep falling from above. Clear them before the board fills.",
	},
	{
		name: "Siege",
		text: "Up to five wizards on their own boards. Lowest score each round is out.",
	},
	{ name: "Duel", text: "You against one rival, three minutes on the clock." },
];

function Title() {
	return (
		<main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pt-10 pb-12 sm:pt-16">
			<h1 className="sr-only">Bookwar</h1>
			<TitleStones />
			<p className="mx-auto mt-6 max-w-md text-center text-lg text-vellum">
				Spell words on rune stones. Break curse runes before they sink to the
				bottom and topple your tower.
			</p>

			<section
				aria-labelledby="classic-heading"
				className="mt-10 flex items-center gap-5"
			>
				<Nox mood="happy" className="h-28 w-24 shrink-0" />
				<div>
					<h2
						id="classic-heading"
						className="font-stone text-3xl font-bold text-gold-bright"
					>
						Classic
					</h2>
					<p className="mt-1 text-vellum-dim">
						No clock. Long words forge crystals that multiply your score; short
						words invite curses.
					</p>
					<Button size="lg" className="mt-4 px-6 font-bold" asChild>
						<Link to="/solo/$mode" params={{ mode: "classic" }}>
							Play Classic
						</Link>
					</Button>
				</div>
			</section>

			<section aria-labelledby="later-heading" className="mt-12">
				<h2 id="later-heading" className="text-vellum-dim">
					Coming to Bookwar
				</h2>
				<ul className="mt-2">
					{LATER_MODES.map((mode) => (
						<li key={mode.name} className="border-t border-gold/20 py-3">
							<p className="font-stone text-xl font-bold text-vellum">
								{mode.name}
							</p>
							<p className="text-sm text-vellum-dim">{mode.text}</p>
						</li>
					))}
				</ul>
			</section>
		</main>
	);
}
