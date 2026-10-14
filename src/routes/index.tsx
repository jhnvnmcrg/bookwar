import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AccountLink } from "#/components/account/AccountLink";
import { Nox } from "#/components/brand/Nox";
import { TitleStones } from "#/components/brand/TitleStones";
import { SOLO_MODE_LIST, SOLO_MODES } from "#/components/game/modes";
import { Button } from "#/components/ui/button";
import type { GameMode, GameState } from "#/game";
import { loadSave, loadScores } from "#/lib/guest-storage";

export const Route = createFileRoute("/")({ component: Title });

const MULTIPLAYER = [
	{
		mode: "duel",
		name: "Duel",
		text: "You against one rival, on the clock. Quick match, a friend with a room code, or the AI.",
		action: "Play a duel",
	},
	{
		mode: "siege",
		name: "Siege",
		text: "Up to five wizards. The lowest score is cut each round until one is left standing.",
		action: "Play a siege",
	},
] as const;

interface ModeProgress {
	readonly save: GameState | null;
	readonly best: number | null;
}

const format = (value: number) => value.toLocaleString("en-US");

/** Saved games and best scores live in this browser, so they're read after hydration. */
function useProgress(): Partial<Record<GameMode, ModeProgress>> {
	const [progress, setProgress] = useState<
		Partial<Record<GameMode, ModeProgress>>
	>({});
	useEffect(() => {
		setProgress(
			Object.fromEntries(
				SOLO_MODE_LIST.map((mode) => [
					mode,
					{ save: loadSave(mode), best: loadScores(mode)[0]?.score ?? null },
				]),
			),
		);
	}, []);
	return progress;
}

function Title() {
	const progress = useProgress();

	return (
		<main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pt-4 pb-12">
			<nav
				aria-label="Your account and the leaderboard"
				className="flex min-h-6 justify-end gap-5"
			>
				<Link
					to="/leaderboard"
					className="text-gold-bright underline-offset-4 hover:underline"
				>
					Leaderboard
				</Link>
				<AccountLink />
			</nav>
			<h1 className="sr-only">Bookwar</h1>
			<div className="mt-2 sm:mt-6">
				<TitleStones />
			</div>
			<p className="mx-auto mt-6 max-w-md text-center text-lg text-vellum">
				Spell words on rune stones. Break curse runes before they sink to the
				bottom and topple your tower.
			</p>

			<section aria-label="Solo games" className="mt-10 flex gap-5">
				<Nox mood="happy" className="hidden h-28 w-24 shrink-0 sm:block" />
				<ul className="flex-1">
					{SOLO_MODE_LIST.map((mode) => {
						const { save, best } = progress[mode] ?? { save: null, best: null };
						return (
							<li
								key={mode}
								className="border-b border-gold/20 pb-6 not-first:pt-6"
							>
								<h2 className="font-stone text-3xl font-bold text-gold-bright">
									{SOLO_MODES[mode].name}
								</h2>
								<p className="mt-1 text-vellum-dim">
									{SOLO_MODES[mode].summary}
								</p>
								<div className="mt-4 flex flex-wrap items-center gap-3">
									{save ? (
										<>
											<Button size="lg" className="px-6 font-bold" asChild>
												<Link to="/solo/$mode" params={{ mode }}>
													Continue
												</Link>
											</Button>
											<Button size="lg" variant="outline" asChild>
												<Link
													to="/solo/$mode"
													params={{ mode }}
													search={{ fresh: true }}
												>
													New game
												</Link>
											</Button>
										</>
									) : (
										<Button size="lg" className="px-6 font-bold" asChild>
											<Link to="/solo/$mode" params={{ mode }}>
												Play {SOLO_MODES[mode].name}
											</Link>
										</Button>
									)}
								</div>
								{(save || best !== null) && (
									<p className="mt-2 text-sm text-vellum-dim">
										{save &&
											`Saved game: level ${save.level}, ${format(save.score)} points. `}
										{best !== null && `Your best: ${format(best)}.`}
									</p>
								)}
							</li>
						);
					})}
				</ul>
			</section>

			<p className="mt-4 text-right">
				<Link
					to="/scores"
					className="text-gold-bright underline-offset-4 hover:underline"
				>
					Your high scores
				</Link>
			</p>

			<section aria-labelledby="multi-heading" className="mt-6 sm:pl-29">
				<h2 id="multi-heading" className="sr-only">
					Play with others
				</h2>
				<ul>
					{MULTIPLAYER.map((entry) => (
						<li
							key={entry.mode}
							className="border-b border-gold/20 pb-6 not-first:pt-6"
						>
							<h3 className="font-stone text-3xl font-bold text-gold-bright">
								{entry.name}
							</h3>
							<p className="mt-1 text-vellum-dim">{entry.text}</p>
							<Button size="lg" className="mt-4 px-6 font-bold" asChild>
								<Link to="/play" search={{ mode: entry.mode }}>
									{entry.action}
								</Link>
							</Button>
						</li>
					))}
				</ul>
			</section>
		</main>
	);
}
