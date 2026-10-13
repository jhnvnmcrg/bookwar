import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { type CSSProperties, type ReactNode, useState } from "react";
import { z } from "zod";
import { Nox } from "#/components/brand/Nox";
import { DuelLobby } from "#/components/duel/DuelLobby";
import { DuelResult } from "#/components/duel/DuelResult";
import { Countdown, MatchClock } from "#/components/duel/MatchClock";
import { NameForm } from "#/components/duel/NameForm";
import { OpponentCard } from "#/components/duel/OpponentCard";
import { HexBoard } from "#/components/game/HexBoard";
import { BOARD_ASPECT } from "#/components/game/hex-geometry";
import { LevelBanner } from "#/components/game/LevelBanner";
import { NoxSays } from "#/components/game/NoxSays";
import { ProphecyScroll } from "#/components/game/ProphecyScroll";
import { ScorePanel } from "#/components/game/ScorePanel";
import { WordTray } from "#/components/game/WordTray";
import { Button } from "#/components/ui/button";
import { type Board, CELL_COUNT } from "#/game";
import type { Dictionary } from "#/game/dictionary";
import { useDictionary } from "#/hooks/useDictionary";
import { type NewRoom, useDuel } from "#/hooks/useDuel";
import { loadProfile, type Profile, saveNickname } from "#/lib/profile";
import {
	BOT_DIFFICULTIES,
	DEFAULT_DUEL_SECONDS,
	DUEL_DURATIONS,
} from "#/shared/protocol";

const ROOM_CODE = /^[A-HJ-NP-Z2-9]{5}$/;

const searchSchema = z.object({
	/** For a new room: match length in seconds. */
	length: z
		.union(
			DUEL_DURATIONS.map((d) => z.literal(d)) as [
				z.ZodLiteral<120>,
				z.ZodLiteral<180>,
				z.ZodLiteral<300>,
			],
		)
		.optional()
		.catch(undefined),
	/** For a new room: seat an AI rival and start at once. */
	bot: z.enum(BOT_DIFFICULTIES).optional().catch(undefined),
});

export const Route = createFileRoute("/room/$code")({
	// Live games need the browser: the socket, the word list and the player's profile.
	ssr: false,
	params: {
		parse: ({ code }) => {
			const upper = code.toUpperCase();
			if (upper === "NEW") return { code: "new" };
			if (!ROOM_CODE.test(upper)) throw notFound();
			return { code: upper };
		},
		stringify: ({ code }) => ({ code }),
	},
	validateSearch: searchSchema,
	head: () => ({ meta: [{ title: "Duel | Bookwar" }] }),
	component: RoomPage,
});

const EMPTY_BOARD: Board = Array.from({ length: CELL_COUNT }, () => null);

function Message({ children }: { children: ReactNode }) {
	return (
		<main className="grid min-h-dvh place-items-center p-4 text-center">
			<div className="max-w-sm">{children}</div>
		</main>
	);
}

function RoomPage() {
	const { code } = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const words = useDictionary();
	const [profile, setProfile] = useState(loadProfile);
	const [create] = useState<NewRoom | null>(() =>
		code === "new"
			? { durationSec: search.length ?? DEFAULT_DUEL_SECONDS, bot: search.bot }
			: null,
	);

	if (!profile.nickname) {
		return (
			<main className="mx-auto max-w-xl px-4 pt-16 pb-12">
				<h1 className="font-stone text-4xl font-bold text-vellum">
					Join the duel
				</h1>
				<p className="mt-2 mb-6 text-vellum-dim">
					Choose the name your rival will see.
				</p>
				<NameForm
					initial=""
					submitLabel="Join"
					onSave={(name) => setProfile(saveNickname(name))}
				/>
			</main>
		);
	}
	if (words.status === "loading") {
		return (
			<Message>
				<Nox mood="idle" className="mx-auto h-24 w-20" />
				<p className="mt-3 text-vellum-dim">Opening the spellbook…</p>
			</Message>
		);
	}
	if (words.status === "failed") {
		return (
			<Message>
				<p>The word list didn't load. Check your connection and try again.</p>
				<Button className="mt-4" onClick={words.retry}>
					Try again
				</Button>
			</Message>
		);
	}
	return (
		<DuelRoom
			code={code === "new" ? null : code}
			create={create}
			profile={profile}
			dictionary={words.dictionary}
			onRoomCreated={(created) =>
				navigate({
					to: "/room/$code",
					params: { code: created },
					search: {},
					replace: true,
				})
			}
		/>
	);
}

function DuelRoom({
	code,
	create,
	profile,
	dictionary,
	onRoomCreated,
}: {
	code: string | null;
	create: NewRoom | null;
	profile: Profile;
	dictionary: Dictionary;
	onRoomCreated: (code: string) => void;
}) {
	const navigate = useNavigate();
	const duel = useDuel({ code, create, profile, dictionary, onRoomCreated });
	const leave = () => {
		duel.leave();
		void navigate({ to: "/play" });
	};

	if (duel.problem) {
		return (
			<Message>
				<Nox mood="worried" className="mx-auto h-24 w-20" />
				<p className="mt-3">{duel.problem.message}</p>
				<Button className="mt-4" asChild>
					<Link to="/play">Back to duels</Link>
				</Button>
			</Message>
		);
	}
	if (duel.left) {
		return (
			<Message>
				<p>You've left the room.</p>
				<Button className="mt-4" asChild>
					<Link to="/play">Back to duels</Link>
				</Button>
			</Message>
		);
	}
	if (!duel.room) {
		return (
			<Message>
				<Nox mood="idle" className="mx-auto h-24 w-20" />
				<p className="mt-3 text-vellum-dim">
					{duel.status === "reconnecting"
						? "Reconnecting…"
						: "Opening the room…"}
				</p>
			</Message>
		);
	}

	const room = duel.room;
	if (room.phase === "waiting") {
		return (
			<DuelLobby
				room={room}
				inviteUrl={`${window.location.origin}/room/${room.code}`}
				onStart={duel.start}
				onAddBot={duel.addBot}
				onRemoveBot={duel.removeBot}
				onSetDuration={duel.setDuration}
				onLeave={leave}
			/>
		);
	}

	const rival = room.seats.find((seat) => seat.seatId !== room.you);
	const mine = duel.mine;

	return (
		<main className="mx-auto grid max-w-6xl gap-x-10 gap-y-4 px-4 pt-3 pb-8 lg:grid-cols-[15rem_minmax(0,34rem)_15rem] lg:grid-rows-[auto_auto_1fr] lg:justify-center lg:pt-6">
			<header className="flex items-center justify-between gap-4 lg:col-span-3">
				<Link
					to="/"
					className="font-display text-xl text-gold-bright hover:text-gold"
				>
					Bookwar
				</Link>
				<div className="flex items-center gap-4">
					{duel.status === "reconnecting" && (
						<p className="text-sm text-rubric" aria-live="polite">
							Reconnecting…
						</p>
					)}
					<p className="text-sm text-vellum-dim">Duel</p>
					<MatchClock
						endsAt={room.phase === "playing" ? room.phaseEndsAt : null}
						serverNow={duel.serverNow}
					/>
				</div>
			</header>

			<div className="lg:col-start-3 lg:row-start-2 lg:pt-2">
				{rival && (
					<OpponentCard seat={rival} board={duel.opponents[rival.seatId]} />
				)}
			</div>

			<aside className="lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:pt-2">
				{mine && <ScorePanel game={mine} />}
			</aside>

			<section
				aria-label="Your board"
				className="lg:col-start-2 lg:row-span-2 lg:row-start-2"
			>
				<div
					className="mx-auto max-w-[calc((100dvh-24rem)*var(--board-aspect))] lg:max-w-[calc((100dvh-16rem)*var(--board-aspect))]"
					style={{ "--board-aspect": BOARD_ASPECT } as CSSProperties}
				>
					<div className="relative">
						<HexBoard
							board={mine?.board ?? EMPTY_BOARD}
							selection={duel.selection}
							casting={duel.casting}
							rejectKey={duel.rejectKey}
							shuffleKey={duel.shuffleKey}
							locked={duel.locked}
							dangerEdge="bottom"
							onPress={duel.press}
							onDrag={duel.drag}
							onRelease={duel.release}
							onCancel={duel.cancelGesture}
							onCastAnimated={duel.finishCast}
						/>
						<LevelBanner banner={duel.banner} />
						{room.phase === "countdown" && room.phaseEndsAt !== null && (
							<Countdown endsAt={room.phaseEndsAt} serverNow={duel.serverNow} />
						)}
					</div>
				</div>
				<div className="mt-4">
					<WordTray
						word={duel.word}
						status={duel.wordStatus}
						preview={duel.preview}
						popups={duel.popups}
						rejectKey={duel.rejectKey}
						locked={duel.locked}
						onCast={duel.cast}
						onClear={duel.clear}
					/>
				</div>
			</section>

			<aside className="flex flex-col gap-5 border-t border-gold/20 pt-4 lg:col-start-3 lg:row-start-3 lg:border-0 lg:pt-0">
				{mine && <ProphecyScroll game={mine} />}
				<div className="flex items-center gap-3 lg:block">
					<Button
						variant="outline"
						disabled={duel.locked}
						onClick={duel.shuffle}
					>
						Shuffle
					</Button>
					<p className="text-sm text-vellum-dim lg:mt-2">
						New letters for every plain stone. Adds a curse rune.
					</p>
				</div>
				<NoxSays line={duel.nox} />
				<Button
					variant="ghost"
					className="justify-start px-0 text-vellum-dim"
					onClick={leave}
				>
					{room.phase === "playing" ? "Forfeit the duel" : "Leave the duel"}
				</Button>
			</aside>

			{room.phase === "finished" && room.result && (
				<DuelResult
					result={room.result}
					you={room.you}
					onRematch={duel.rematch}
					onLeave={leave}
				/>
			)}
		</main>
	);
}
