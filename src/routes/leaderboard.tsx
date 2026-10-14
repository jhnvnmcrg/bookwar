import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "#/components/ui/button";
import { rankFor } from "#/game";
import { getLeaderboard } from "#/server/accounts/account.functions";
import type { LeaderRow, WinsRow } from "#/shared/accounts";

const BOARDS = ["classic", "action", "duel", "siege"] as const;
type BoardName = (typeof BOARDS)[number];

const ABOUT: Record<BoardName, { name: string; note: string; empty: string }> =
	{
		classic: {
			name: "Classic",
			note: "Each wizard's best Classic game. Every score here was checked by replaying the game on the server.",
			empty: "No Classic scores yet.",
		},
		action: {
			name: "Action",
			note: "Each wizard's best Action game. Every score here was checked by replaying the game on the server.",
			empty: "No Action scores yet.",
		},
		duel: {
			name: "Duel",
			note: "Most duels won against other wizards. Duels against the AI don't count here.",
			empty: "No duels between signed-in wizards yet.",
		},
		siege: {
			name: "Siege",
			note: "Most sieges won against other wizards. Sieges against only AI rivals don't count here.",
			empty: "No sieges between signed-in wizards yet.",
		},
	};

export const Route = createFileRoute("/leaderboard")({
	validateSearch: z.object({
		board: z.enum(BOARDS).optional().catch(undefined),
	}),
	loader: () => getLeaderboard(),
	head: () => ({ meta: [{ title: "Leaderboard | Bookwar" }] }),
	component: LeaderboardPage,
});

const format = (value: number) => value.toLocaleString("en-US");

function LeaderboardPage() {
	const { board = "classic" } = Route.useSearch();
	const data = Route.useLoaderData();
	const about = ABOUT[board];
	const solo = board === "classic" || board === "action";
	const rows = data[board];

	return (
		<main className="mx-auto max-w-2xl px-4 pt-6 pb-12">
			<Link
				to="/"
				className="font-display text-xl text-gold-bright hover:text-gold"
			>
				Bookwar
			</Link>
			<h1 className="mt-8 font-stone text-4xl font-bold text-vellum">
				Leaderboard
			</h1>

			<nav aria-label="Leaderboards" className="mt-5 flex flex-wrap gap-2">
				{BOARDS.map((name) => (
					<Button
						key={name}
						variant={name === board ? "default" : "outline"}
						asChild
					>
						<Link
							to="/leaderboard"
							search={{ board: name }}
							replace
							aria-current={name === board ? "page" : undefined}
						>
							{ABOUT[name].name}
						</Link>
					</Button>
				))}
			</nav>
			<p className="mt-4 text-vellum-dim">{about.note}</p>

			{rows.length === 0 ? (
				<div className="mt-8 border-t border-gold/20 pt-6">
					<p className="text-vellum">{about.empty}</p>
					<p className="mt-1 text-vellum-dim">
						{solo
							? "Sign in, then finish a game: it goes on the board when it ends."
							: "Sign in, then win a match against another wizard."}
					</p>
					<div className="mt-4 flex flex-wrap gap-3">
						<Button asChild>
							{solo ? (
								<Link to="/solo/$mode" params={{ mode: board }}>
									Play {about.name}
								</Link>
							) : (
								<Link to="/play" search={{ mode: board }}>
									Play a {about.name.toLowerCase()}
								</Link>
							)}
						</Button>
						<Button variant="outline" asChild>
							<Link to="/account">Sign in</Link>
						</Button>
					</div>
				</div>
			) : solo ? (
				<ScoreTable rows={rows as readonly LeaderRow[]} />
			) : (
				<WinsTable rows={rows as readonly WinsRow[]} />
			)}
		</main>
	);
}

const cell = "border-t border-gold/20 py-2.5";

function ScoreTable({ rows }: { rows: readonly LeaderRow[] }) {
	return (
		<table className="mt-6 w-full text-left">
			<thead className="text-sm text-vellum-dim">
				<tr>
					<th scope="col" className="w-10 pb-2 font-normal">
						Place
					</th>
					<th scope="col" className="pb-2 font-normal">
						Wizard
					</th>
					<th scope="col" className="pb-2 text-right font-normal">
						Score
					</th>
					<th
						scope="col"
						className="hidden pb-2 pl-6 font-normal sm:table-cell"
					>
						Best word
					</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr key={row.place}>
						<td className={`${cell} figures text-vellum-dim`}>{row.place}</td>
						<td className={cell}>
							<p className="font-stone text-lg font-bold leading-tight text-vellum">
								{row.nickname}
							</p>
							<p className="text-sm text-vellum-dim">
								{rankFor(row.level)}, level {row.level}
							</p>
						</td>
						<td
							className={`${cell} figures text-right text-xl font-bold text-gold-bright`}
						>
							{format(row.score)}
						</td>
						<td
							className={`${cell} hidden pl-6 font-stone uppercase tracking-wider text-vellum sm:table-cell`}
						>
							{row.bestWord ?? "None"}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function WinsTable({ rows }: { rows: readonly WinsRow[] }) {
	return (
		<table className="mt-6 w-full text-left">
			<thead className="text-sm text-vellum-dim">
				<tr>
					<th scope="col" className="w-10 pb-2 font-normal">
						Place
					</th>
					<th scope="col" className="pb-2 font-normal">
						Wizard
					</th>
					<th scope="col" className="pb-2 text-right font-normal">
						Wins
					</th>
					<th scope="col" className="pb-2 pl-6 text-right font-normal">
						Matches
					</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr key={row.place}>
						<td className={`${cell} figures text-vellum-dim`}>{row.place}</td>
						<td
							className={`${cell} font-stone text-lg font-bold leading-tight text-vellum`}
						>
							{row.nickname}
						</td>
						<td
							className={`${cell} figures text-right text-xl font-bold text-gold-bright`}
						>
							{format(row.wins)}
						</td>
						<td className={`${cell} figures pl-6 text-right text-vellum-dim`}>
							{format(row.played)}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
