import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Nox } from "#/components/brand/Nox";
import { SOLO_MODE_LIST, SOLO_MODES } from "#/components/game/modes";
import { NameForm } from "#/components/match/NameForm";
import { Button } from "#/components/ui/button";
import { rankFor } from "#/game";
import { problemText, rename, syncAccountOnce } from "#/lib/account";
import { authClient } from "#/lib/auth-client";
import { ordinal } from "#/lib/ordinal";
import { loadProfile } from "#/lib/profile";
import { getMyAccount } from "#/server/accounts/account.functions";
import type { MyMatch, MyScore } from "#/shared/accounts";

const format = (value: number) => value.toLocaleString("en-US");
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/** "Won a duel against Bob", "2nd of 5 in a siege". */
function matchLine(match: MyMatch): string {
	if (match.mode === "duel") {
		const rival = match.rivals[0] ?? "a rival";
		if (match.won) return `Won a duel against ${rival}`;
		if (match.draw) return `Drew a duel with ${rival}`;
		return `Lost a duel to ${rival}`;
	}
	if (match.won) return `Won a siege of ${match.rivals.length + 1}`;
	return `${ordinal(match.place)} of ${match.rivals.length + 1} in a siege`;
}

function ScoreList({ scores }: { scores: readonly MyScore[] }) {
	return (
		<ol className="mt-2">
			{scores.map((score) => (
				<li
					key={`${score.playedAt}-${score.score}`}
					className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-t border-gold/20 py-2.5"
				>
					<div>
						<p className="figures text-xl font-bold text-vellum">
							{format(score.score)}
						</p>
						<p className="text-sm text-vellum-dim">
							{rankFor(score.level)}, level {score.level}
							{score.bestWord && (
								<>
									, best{" "}
									<span className="font-stone uppercase tracking-wider text-vellum">
										{score.bestWord}
									</span>
								</>
							)}
						</p>
					</div>
					<div className="text-right text-sm">
						<time dateTime={score.playedAt} className="text-vellum-dim">
							{dateFormat.format(new Date(score.playedAt))}
						</time>
						<p
							className={score.verified ? "text-verdigris" : "text-vellum-dim"}
						>
							{score.verified ? "On the leaderboard" : "Not checked"}
						</p>
					</div>
				</li>
			))}
		</ol>
	);
}

/** The signed-in player's page: name, scores, record and recent matches. */
export function AccountPanel({
	userId,
	email,
	nickname,
}: {
	userId: string;
	email: string;
	nickname: string | null;
}) {
	const queryClient = useQueryClient();
	const [editing, setEditing] = useState(false);
	const [signingOut, setSigningOut] = useState(false);
	const account = useQuery({
		queryKey: ["account", userId],
		queryFn: async () => {
			// Right after signing in, wait for this browser's scores to arrive first.
			await syncAccountOnce(userId).catch(() => {});
			return getMyAccount();
		},
	});
	const data = account.data;
	// This browser already uses the account's name after the first sync.
	const name = data?.nickname ?? nickname ?? (loadProfile().nickname || null);

	// Forget this account's records once the page stops showing them (after signing out).
	useEffect(
		() => () => queryClient.removeQueries({ queryKey: ["account", userId] }),
		[queryClient, userId],
	);

	async function signOut() {
		setSigningOut(true);
		try {
			await authClient().signOut();
		} finally {
			setSigningOut(false);
		}
	}

	return (
		<>
			<section aria-labelledby="account-heading" className="mt-8">
				<h1
					id="account-heading"
					className="font-stone text-4xl font-bold text-vellum"
				>
					{name ?? "Your account"}
				</h1>
				<p className="mt-1 text-vellum-dim">Signed in as {email}.</p>
				{editing ? (
					<div className="mt-5">
						<NameForm
							initial={name ?? ""}
							onSave={(next) => {
								rename(next);
								if (data)
									queryClient.setQueryData(["account", userId], {
										...data,
										nickname: next,
									});
								setEditing(false);
							}}
						/>
					</div>
				) : (
					<div className="mt-4 flex flex-wrap gap-3">
						<Button variant="outline" onClick={() => setEditing(true)}>
							Change wizard name
						</Button>
						<Button
							variant="outline"
							disabled={signingOut}
							onClick={() => void signOut()}
						>
							{signingOut ? "Signing out…" : "Sign out"}
						</Button>
					</div>
				)}
			</section>

			{account.isPending && (
				<p className="mt-10 text-vellum-dim">Opening your records…</p>
			)}
			{account.isError && (
				<div className="mt-10">
					<p>{problemText(account.error)}</p>
					<Button className="mt-3" onClick={() => void account.refetch()}>
						Try again
					</Button>
				</div>
			)}

			{data && (
				<>
					<section
						aria-labelledby="solo-heading"
						className="mt-10 border-t border-gold/20 pt-6"
					>
						<h2
							id="solo-heading"
							className="font-stone text-2xl font-bold text-gold-bright"
						>
							Solo scores
						</h2>
						<p className="mt-1 text-vellum-dim">
							Games you finish while signed in are checked and go on the{" "}
							<Link
								to="/leaderboard"
								className="text-gold-bright underline-offset-4 hover:underline"
							>
								leaderboard
							</Link>
							. Older games from this browser that can't be checked stay here
							only.
						</p>
						{SOLO_MODE_LIST.map((mode) => {
							const scores = data.scores.filter((score) => score.mode === mode);
							return (
								<div key={mode} className="mt-6">
									<h3 className="font-stone text-xl font-bold text-vellum">
										{SOLO_MODES[mode].name}
									</h3>
									{scores.length === 0 ? (
										<p className="mt-1 text-vellum-dim">
											No games yet.{" "}
											<Link
												to="/solo/$mode"
												params={{ mode }}
												className="text-gold-bright underline-offset-4 hover:underline"
											>
												Play {SOLO_MODES[mode].name}
											</Link>
										</p>
									) : (
										<ScoreList scores={scores} />
									)}
								</div>
							);
						})}
					</section>

					<section
						aria-labelledby="matches-heading"
						className="mt-10 border-t border-gold/20 pt-6"
					>
						<h2
							id="matches-heading"
							className="font-stone text-2xl font-bold text-gold-bright"
						>
							Matches
						</h2>
						<p className="mt-1 text-vellum">
							Duels: {data.record.duel.won} won of {data.record.duel.played}.
							Sieges: {data.record.siege.won} won of {data.record.siege.played}.
						</p>
						{data.matches.length === 0 ? (
							<p className="mt-2 text-vellum-dim">
								No matches yet.{" "}
								<Link
									to="/play"
									className="text-gold-bright underline-offset-4 hover:underline"
								>
									Find a duel or a siege
								</Link>
							</p>
						) : (
							<ol className="mt-3">
								{data.matches.map((match) => (
									<li
										key={match.id}
										className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-t border-gold/20 py-2.5"
									>
										<div>
											<p
												className={
													match.won ? "text-gold-bright" : "text-vellum"
												}
											>
												{matchLine(match)}
											</p>
											<p className="text-sm text-vellum-dim">
												{format(match.score)} points
												{match.mode === "siege" &&
													match.rivals.length > 0 &&
													`. Against ${match.rivals.join(", ")}`}
												{match.vsAi && ". AI match"}
											</p>
										</div>
										<time
											dateTime={match.endedAt}
											className="text-sm text-vellum-dim"
										>
											{dateFormat.format(new Date(match.endedAt))}
										</time>
									</li>
								))}
							</ol>
						)}
					</section>
				</>
			)}

			{!data && !account.isPending && !account.isError && (
				<Nox mood="idle" className="mt-10 h-24 w-20" />
			)}
		</>
	);
}
