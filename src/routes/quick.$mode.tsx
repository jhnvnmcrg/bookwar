import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { Nox } from "#/components/brand/Nox";
import { formatClock, useTicker } from "#/components/match/MatchClock";
import { MODE_NAMES } from "#/components/match/modes";
import { NameForm } from "#/components/match/NameForm";
import { Button } from "#/components/ui/button";
import { useMatchSocket } from "#/hooks/useMatchSocket";
import { useProfile } from "#/hooks/useProfile";
import { rename } from "#/lib/account";
import type { Profile } from "#/lib/profile";
import {
	MATCH_MODES,
	type MatchMode,
	MODE_SEATS,
	type QueueView,
	type ServerMessage,
} from "#/shared/protocol";

export const Route = createFileRoute("/quick/$mode")({
	// Matchmaking runs over the browser's game connection.
	ssr: false,
	params: {
		parse: ({ mode }) => {
			if (!(MATCH_MODES as readonly string[]).includes(mode)) throw notFound();
			return { mode: mode as MatchMode };
		},
		stringify: ({ mode }) => ({ mode }),
	},
	head: () => ({ meta: [{ title: "Quick match | Bookwar" }] }),
	component: QuickPage,
});

function QuickPage() {
	const { mode } = Route.useParams();
	const [profile, setProfile] = useProfile();
	if (!profile.nickname) {
		return (
			<main className="mx-auto max-w-xl px-4 pt-16 pb-12">
				<h1 className="font-stone text-4xl font-bold text-vellum">
					Quick match
				</h1>
				<p className="mt-2 mb-6 text-vellum-dim">
					Choose the name your rivals will see.
				</p>
				<NameForm
					initial=""
					submitLabel="Find a match"
					onSave={(n) => setProfile(rename(n))}
				/>
			</main>
		);
	}
	return <Matchmaking mode={mode} profile={profile} />;
}

function Matchmaking({ mode, profile }: { mode: MatchMode; profile: Profile }) {
	const navigate = useNavigate();
	const [queue, setQueue] = useState<QueueView | null>(null);
	const [keepWaiting, setKeepWaiting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const onMessage = (message: ServerMessage) => {
		if (message.type === "welcome") socket.send({ type: "quickMatch", mode });
		else if (message.type === "queue") setQueue(message.queue);
		else if (message.type === "room") {
			void navigate({
				to: "/room/$code",
				params: { code: message.room.code },
				replace: true,
			});
		} else if (message.type === "error") setError(message.message);
	};
	const socket = useMatchSocket(profile, onMessage);
	useTicker(queue?.startsAt != null, 500);

	const name = MODE_NAMES[mode].toLowerCase();
	const startsIn = queue?.startsAt ? queue.startsAt - socket.serverNow() : null;

	function cancel() {
		socket.send({ type: "cancelQueue" });
		void navigate({ to: "/play", search: { mode } });
	}

	return (
		<main className="grid min-h-dvh place-items-center px-4 text-center">
			<div className="max-w-sm">
				<Nox
					mood={queue?.alone ? "worried" : "idle"}
					className="mx-auto h-28 w-24"
				/>
				<h1 className="mt-4 font-stone text-3xl font-bold text-vellum">
					Finding a {name}…
				</h1>
				<p className="mt-2 text-vellum-dim" aria-live="polite">
					{error ??
						(!queue
							? "Connecting…"
							: mode === "duel"
								? "Waiting for a rival."
								: `${queue.players} of ${MODE_SEATS.siege} wizards here.${
										startsIn !== null
											? ` Starting in ${formatClock(startsIn)}.`
											: ""
									}`)}
				</p>

				{queue?.alone && !keepWaiting && (
					<div className="mt-6 rounded-lg bg-lapis-raised p-4 ring-1 ring-gold/30">
						<p className="text-vellum">No one else is looking right now.</p>
						<div className="mt-4 flex flex-wrap justify-center gap-3">
							<Button asChild className="font-bold">
								<Link
									to="/room/$code"
									params={{ code: "new" }}
									search={{ mode, ai: "medium" }}
									onClick={() => socket.send({ type: "cancelQueue" })}
								>
									Play the AI instead
								</Link>
							</Button>
							<Button variant="outline" onClick={() => setKeepWaiting(true)}>
								Keep waiting
							</Button>
						</div>
					</div>
				)}

				<Button
					variant="ghost"
					className="mt-8 text-vellum-dim"
					onClick={cancel}
				>
					Cancel
				</Button>
			</div>
		</main>
	);
}
