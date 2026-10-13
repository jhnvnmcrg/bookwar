import { createFileRoute, Link } from "@tanstack/react-router";
import { SOLO_MODE_LIST, SOLO_MODES } from "#/components/game/modes";
import { rankFor } from "#/game";
import { loadScores } from "#/lib/guest-storage";

export const Route = createFileRoute("/scores")({
	// Scores are stored in this browser only.
	ssr: false,
	head: () => ({ meta: [{ title: "High scores | Bookwar" }] }),
	component: Scores,
});

const format = (value: number) => value.toLocaleString("en-US");
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function Scores() {
	return (
		<main className="mx-auto max-w-2xl px-4 pt-6 pb-12">
			<Link
				to="/"
				className="font-display text-xl text-gold-bright hover:text-gold"
			>
				Bookwar
			</Link>
			<h1 className="mt-8 font-stone text-4xl font-bold text-vellum">
				High scores
			</h1>
			<p className="mt-1 text-vellum-dim">
				Your best games, saved in this browser.
			</p>

			{SOLO_MODE_LIST.map((mode) => {
				const scores = loadScores(mode);
				return (
					<section
						key={mode}
						aria-labelledby={`${mode}-scores`}
						className="mt-10"
					>
						<h2
							id={`${mode}-scores`}
							className="font-stone text-2xl font-bold text-gold-bright"
						>
							{SOLO_MODES[mode].name}
						</h2>
						{scores.length === 0 ? (
							<p className="mt-2 text-vellum-dim">
								No finished games yet.{" "}
								<Link
									to="/solo/$mode"
									params={{ mode }}
									className="text-gold-bright underline-offset-4 hover:underline"
								>
									Play {SOLO_MODES[mode].name}
								</Link>
							</p>
						) : (
							<ol className="mt-3">
								{scores.map((entry, i) => (
									<li
										key={`${entry.playedAt}-${entry.seed}`}
										className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-x-3 border-t border-gold/20 py-2.5"
									>
										<span className="figures text-vellum-dim">{i + 1}</span>
										<div>
											<p className="figures text-xl font-bold text-vellum">
												{format(entry.score)}
											</p>
											<p className="text-sm text-vellum-dim">
												{rankFor(entry.level)}, level {entry.level}.{" "}
												{entry.words} {entry.words === 1 ? "word" : "words"}
												{entry.bestWord && (
													<>
														, best{" "}
														<span className="font-stone uppercase tracking-wider text-vellum">
															{entry.bestWord.word}
														</span>
													</>
												)}
											</p>
										</div>
										<time
											dateTime={entry.playedAt}
											className="text-sm text-vellum-dim"
										>
											{dateFormat.format(new Date(entry.playedAt))}
										</time>
									</li>
								))}
							</ol>
						)}
					</section>
				);
			})}
		</main>
	);
}
