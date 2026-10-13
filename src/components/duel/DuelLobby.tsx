import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
	BOT_DIFFICULTIES,
	type BotDifficulty,
	DUEL_DURATIONS,
	type DuelDuration,
	type RoomView,
} from "#/shared/protocol";

const DIFFICULTY_NAMES: Record<BotDifficulty, string> = {
	easy: "Easy",
	medium: "Medium",
	hard: "Hard",
};

/** The room before a duel: share the code, wait for a rival (or add an AI), then start. */
export function DuelLobby({
	room,
	inviteUrl,
	onStart,
	onAddBot,
	onRemoveBot,
	onSetDuration,
	onLeave,
}: {
	room: RoomView;
	inviteUrl: string;
	onStart: () => void;
	onAddBot: (difficulty: BotDifficulty) => void;
	onRemoveBot: (seatId: string) => void;
	onSetDuration: (seconds: DuelDuration) => void;
	onLeave: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const me = room.seats.find((seat) => seat.seatId === room.you);
	const host = room.seats.find((seat) => seat.host);
	const isHost = me?.host ?? false;
	const bot = room.seats.find((seat) => seat.bot);
	const full = room.seats.length >= 2;

	async function copyInvite() {
		try {
			await navigator.clipboard.writeText(inviteUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2500);
		} catch {
			setCopied(false);
		}
	}

	return (
		<main className="mx-auto max-w-xl px-4 pt-6 pb-12">
			<Link
				to="/"
				className="font-display text-xl text-gold-bright hover:text-gold"
			>
				Bookwar
			</Link>
			<h1 className="mt-8 font-stone text-4xl font-bold text-vellum">
				Duel room
			</h1>

			<section aria-label="Invite a rival" className="mt-6">
				<p className="text-sm text-vellum-dim">Room code</p>
				<p className="figures font-stone text-5xl font-bold tracking-[0.2em] text-gold-bright">
					{room.code}
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-3">
					<Button variant="outline" onClick={copyInvite}>
						Copy invite link
					</Button>
					<p className="text-sm text-vellum-dim" aria-live="polite">
						{copied ? "Link copied." : "Send the link or the code to a friend."}
					</p>
				</div>
			</section>

			<section aria-labelledby="seats-heading" className="mt-8">
				<h2 id="seats-heading" className="text-vellum-dim">
					Wizards
				</h2>
				<ul className="mt-2">
					{room.seats.map((seat) => (
						<li
							key={seat.seatId}
							className="flex items-center justify-between gap-3 border-t border-gold/20 py-3"
						>
							<p>
								<span className="font-stone text-xl font-bold text-vellum">
									{seat.name}
								</span>{" "}
								<span className="text-sm text-vellum-dim">
									{[
										seat.seatId === room.you && "you",
										seat.host && "host",
										seat.bot && `AI, ${DIFFICULTY_NAMES[seat.bot]}`,
										!seat.connected && "reconnecting",
									]
										.filter(Boolean)
										.join(", ")}
								</span>
							</p>
							{isHost && seat.bot && (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => onRemoveBot(seat.seatId)}
								>
									Remove
								</Button>
							)}
						</li>
					))}
					{!full && (
						<li className="border-t border-gold/20 py-3 text-vellum-dim">
							Waiting for a rival to join…
						</li>
					)}
				</ul>
			</section>

			{isHost ? (
				<section
					aria-label="Match settings"
					className="mt-8 flex flex-col gap-6"
				>
					<div>
						<p className="text-sm text-vellum-dim">Match length</p>
						<div className="mt-2 flex gap-2">
							{DUEL_DURATIONS.map((seconds) => (
								<Button
									key={seconds}
									variant={room.durationSec === seconds ? "default" : "outline"}
									aria-pressed={room.durationSec === seconds}
									onClick={() => onSetDuration(seconds)}
								>
									{seconds / 60} min
								</Button>
							))}
						</div>
					</div>
					{!full && !bot && (
						<div>
							<p className="text-sm text-vellum-dim">
								No one to play? Add an AI rival.
							</p>
							<div className="mt-2 flex gap-2">
								{BOT_DIFFICULTIES.map((difficulty) => (
									<Button
										key={difficulty}
										variant="outline"
										onClick={() => onAddBot(difficulty)}
									>
										{DIFFICULTY_NAMES[difficulty]}
									</Button>
								))}
							</div>
						</div>
					)}
					<div>
						<Button
							size="lg"
							className="px-8 font-bold"
							disabled={!full}
							onClick={onStart}
						>
							Start duel
						</Button>
						{!full && (
							<p className="mt-2 text-sm text-vellum-dim">
								You can start once a rival is here.
							</p>
						)}
					</div>
				</section>
			) : (
				<p className="mt-8 text-vellum-dim">
					Waiting for {host?.name ?? "the host"} to start a{" "}
					{room.durationSec / 60}-minute duel.
				</p>
			)}

			<Button
				variant="ghost"
				className="mt-8 px-0 text-vellum-dim"
				onClick={onLeave}
			>
				Leave room
			</Button>
		</main>
	);
}
