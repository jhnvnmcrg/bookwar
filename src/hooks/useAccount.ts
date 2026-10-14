import { useEffect, useState } from "react";
import type { GameMode } from "#/game";
import { problemText, submitGame, syncAccountOnce } from "#/lib/account";
import { accountsEnabled, authClient } from "#/lib/auth-client";
import type { ScoreEntry } from "#/lib/guest-storage";

export type Account =
	/** Accounts aren't configured on this server. */
	| { readonly status: "off" }
	| { readonly status: "loading" }
	| { readonly status: "guest" }
	| {
			readonly status: "signed-in";
			readonly userId: string;
			readonly email: string;
			/** The account's wizard name, once the first sync has finished. */
			readonly nickname: string | null;
	  };

function useLiveAccount(): Account {
	const session = authClient().useSession();
	const user = session.data?.user ?? null;
	const userId = user?.id ?? null;
	const [synced, setSynced] = useState<{
		userId: string;
		nickname: string;
	} | null>(null);

	useEffect(() => {
		if (!userId) return;
		let live = true;
		syncAccountOnce(userId).then(
			({ nickname }) => {
				if (live) setSynced({ userId, nickname });
			},
			() => {
				// Playing still works; the sync is tried again on the next page load.
			},
		);
		return () => {
			live = false;
		};
	}, [userId]);

	if (session.isPending) return { status: "loading" };
	if (!user) return { status: "guest" };
	return {
		status: "signed-in",
		userId: user.id,
		email: user.email,
		nickname: synced?.userId === user.id ? synced.nickname : null,
	};
}

const OFF: Account = { status: "off" };
const useAccountOff = (): Account => OFF;

/** Who's playing: a guest, or a signed-in player (whose account is synced on first use). */
export const useAccount = accountsEnabled ? useLiveAccount : useAccountOff;

export type LeaderboardStatus =
	/** Nothing to say: accounts are off, or the session is still loading. */
	| { readonly status: "none" }
	| { readonly status: "guest" }
	/** A game continued from an older save, without a move log. */
	| { readonly status: "unchecked" }
	| { readonly status: "saving" }
	| { readonly status: "saved"; readonly place: number }
	| { readonly status: "failed"; readonly message: string };

/** Sends a finished Solo game to the leaderboard when the player is signed in. */
export function useLeaderboardEntry(
	mode: GameMode,
	finished: ScoreEntry | null,
): LeaderboardStatus {
	const account = useAccount();
	const userId = account.status === "signed-in" ? account.userId : null;
	const [outcome, setOutcome] = useState<{
		entry: ScoreEntry;
		status: LeaderboardStatus;
	} | null>(null);

	useEffect(() => {
		if (!finished?.moves || !userId) return;
		let live = true;
		submitGame(userId, mode, finished).then(
			(result) => {
				if (live)
					setOutcome({
						entry: finished,
						status: { status: "saved", place: result.place },
					});
			},
			(error: unknown) => {
				if (live)
					setOutcome({
						entry: finished,
						status: { status: "failed", message: problemText(error) },
					});
			},
		);
		return () => {
			live = false;
		};
	}, [mode, finished, userId]);

	if (!finished) return { status: "none" };
	if (account.status === "guest") return { status: "guest" };
	if (account.status !== "signed-in") return { status: "none" };
	if (!finished.moves) return { status: "unchecked" };
	return outcome?.entry === finished ? outcome.status : { status: "saving" };
}
