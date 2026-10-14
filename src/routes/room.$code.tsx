import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import {
	type CSSProperties,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { z } from "zod";
import { Nox } from "#/components/brand/Nox";
import { HexBoard } from "#/components/game/HexBoard";
import { BOARD_ASPECT } from "#/components/game/hex-geometry";
import { LevelBanner } from "#/components/game/LevelBanner";
import { NoxSays } from "#/components/game/NoxSays";
import { ProphecyScroll } from "#/components/game/ProphecyScroll";
import { ScorePanel } from "#/components/game/ScorePanel";
import { SoundToggle } from "#/components/game/SoundToggle";
import { WordTray } from "#/components/game/WordTray";
import { Countdown, MatchClock } from "#/components/match/MatchClock";
import { MatchLobby } from "#/components/match/MatchLobby";
import { MatchResultDialog } from "#/components/match/MatchResultDialog";
import { MODE_NAMES } from "#/components/match/modes";
import { NameForm } from "#/components/match/NameForm";
import { OpponentCard } from "#/components/match/OpponentCard";
import { RivalList } from "#/components/match/RivalList";
import { OutOverlay, RoundBreak } from "#/components/match/RoundOverlays";
import { Button } from "#/components/ui/button";
import { type Board, CELL_COUNT } from "#/game";
import type { Dictionary } from "#/game/dictionary";
import { useDictionary } from "#/hooks/useDictionary";
import { type NewRoom, useMatch } from "#/hooks/useMatch";
import { useProfile } from "#/hooks/useProfile";
import { rename } from "#/lib/account";
import type { Profile } from "#/lib/profile";
import { playSound } from "#/lib/sound";
import {
	BOT_DIFFICULTIES,
	DEFAULT_SECONDS,
	MATCH_MODES,
	MODE_SECONDS,
	type RoomView,
} from "#/shared/protocol";

const ROOM_CODE = /^[A-HJ-NP-Z2-9]{5}$/;

const searchSchema = z.object({
	/** For a new room: Duel or Siege. */
	mode: z.enum(MATCH_MODES).optional().catch(undefined),
	/** For a new room: match length (Duel) or round length (Siege), in seconds. */
	seconds: z.number().int().optional().catch(undefined),
	/** For a new room: fill the other seats with AI rivals and start at once. */
	ai: z.enum(BOT_DIFFICULTIES).optional().catch(undefined),
	/** Siege against AI: how many rivals (1–4). */
	rivals: z.number().int().min(1).max(4).optional().catch(undefined),
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
	head: () => ({ meta: [{ title: "Match | Bookwar" }] }),
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

/** The room to create from the search params, with unknown settings swapped for defaults. */
function newRoomFrom(search: z.infer<typeof searchSchema>): NewRoom {
	const mode = search.mode ?? "duel";
	const seconds =
		search.seconds !== undefined &&
		(MODE_SECONDS[mode] as readonly number[]).includes(search.seconds)
			? search.seconds
			: DEFAULT_SECONDS[mode];
	return {
		mode,
		seconds,
		ai: search.ai
			? {
					difficulty: search.ai,
					count: mode === "duel" ? 1 : (search.rivals ?? 4),
				}
			: undefined,
	};
}

function RoomPage() {
	const { code } = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const words = useDictionary();
	const [profile, setProfile] = useProfile();
	const [create] = useState<NewRoom | null>(() =>
		code === "new" ? newRoomFrom(search) : null,
	);

	if (!profile.nickname) {
		return (
			<main className="mx-auto max-w-xl px-4 pt-16 pb-12">
				<h1 className="font-stone text-4xl font-bold text-vellum">
					Join the match
				</h1>
				<p className="mt-2 mb-6 text-vellum-dim">
					Choose the name your rivals will see.
				</p>
				<NameForm
					initial=""
					submitLabel="Join"
					onSave={(name) => setProfile(rename(name))}
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
		<MatchRoom
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

/** The lowest score among wizards still in, if there's more than one of them. */
function lowestScore(room: RoomView): number | null {
	const alive = room.seats.filter((seat) => !seat.out);
	if (room.mode !== "siege" || alive.length < 2) return null;
	return Math.min(...alive.map((seat) => seat.score));
}

/** "Go" when play starts (and each new Siege round), a gong when a round ends in a cut. */
function useRoundSounds(phase: RoomView["phase"] | null) {
	const previous = useRef(phase);
	useEffect(() => {
		const before = previous.current;
		previous.current = phase;
		if (phase === before) return;
		if (
			phase === "playing" &&
			(before === "countdown" || before === "roundEnd")
		)
			playSound("go");
		else if (phase === "roundEnd") playSound("cut");
	}, [phase]);
}

function MatchRoom({
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
	const match = useMatch({ code, create, profile, dictionary, onRoomCreated });
	useRoundSounds(match.room?.phase ?? null);
	const leave = () => {
		match.leave();
		void navigate({ to: "/play" });
	};

	if (match.problem) {
		return (
			<Message>
				<Nox mood="worried" className="mx-auto h-24 w-20" />
				<p className="mt-3">{match.problem.message}</p>
				<Button className="mt-4" asChild>
					<Link to="/play">Back to multiplayer</Link>
				</Button>
			</Message>
		);
	}
	if (match.left) {
		return (
			<Message>
				<p>You've left the room.</p>
				<Button className="mt-4" asChild>
					<Link to="/play">Back to multiplayer</Link>
				</Button>
			</Message>
		);
	}
	if (!match.room) {
		return (
			<Message>
				<Nox mood="idle" className="mx-auto h-24 w-20" />
				<p className="mt-3 text-vellum-dim">
					{match.status === "reconnecting"
						? "Reconnecting…"
						: "Opening the room…"}
				</p>
			</Message>
		);
	}

	const room = match.room;
	if (room.phase === "waiting") {
		return (
			<MatchLobby
				room={room}
				inviteUrl={`${window.location.origin}/room/${room.code}`}
				onStart={match.start}
				onAddBot={match.addBot}
				onRemoveBot={match.removeBot}
				onSetSeconds={match.setSeconds}
				onLeave={leave}
			/>
		);
	}

	const siege = room.mode === "siege";
	const mine = match.mine;
	const me = match.me;
	const rivals = room.seats.filter((seat) => seat.seatId !== room.you);
	const lowest = lowestScore(room);
	const alive = room.seats.filter((seat) => !seat.out).length;
	const iAmLowest =
		lowest !== null && me !== null && !me.out && me.score === lowest;
	const live = room.phase === "playing" || room.phase === "roundEnd";

	return (
		<main className="mx-auto grid max-w-6xl gap-x-10 gap-y-4 px-4 pt-3 pb-8 lg:grid-cols-[15rem_minmax(0,34rem)_15rem] lg:grid-rows-[auto_auto_1fr] lg:justify-center lg:pt-6">
			<header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 lg:col-span-3">
				<Link
					to="/"
					className="font-display text-xl text-gold-bright hover:text-gold"
				>
					Bookwar
				</Link>
				<div className="flex items-center gap-4">
					{match.status === "reconnecting" && (
						<p className="text-sm text-rubric" aria-live="polite">
							Reconnecting…
						</p>
					)}
					<p className="text-sm text-vellum-dim">
						{siege && room.round > 0
							? `Round ${room.round}, ${alive} wizards left`
							: MODE_NAMES[room.mode]}
					</p>
					<MatchClock
						endsAt={room.phase === "playing" ? room.phaseEndsAt : null}
						serverNow={match.serverNow}
					/>
					<SoundToggle />
				</div>
				{iAmLowest && room.phase === "playing" && (
					<p
						className="w-full text-right text-sm text-rubric"
						aria-live="polite"
					>
						You have the lowest score. Score before the round ends!
					</p>
				)}
			</header>

			<div className="lg:col-start-3 lg:row-start-2 lg:pt-2">
				{siege ? (
					<RivalList
						rivals={rivals}
						boards={match.opponents}
						lowestScore={lowest}
					/>
				) : (
					rivals[0] && (
						<OpponentCard
							seat={rivals[0]}
							board={match.opponents[rivals[0].seatId]}
						/>
					)
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
							selection={match.selection}
							casting={match.casting}
							rejectKey={match.rejectKey}
							shuffleKey={match.shuffleKey}
							locked={match.locked}
							dangerEdge="bottom"
							glow={match.glow}
							fallen={me?.out === "tower"}
							onPress={match.press}
							onDrag={match.drag}
							onRelease={match.release}
							onCancel={match.cancelGesture}
							onCastAnimated={match.finishCast}
						/>
						<LevelBanner banner={match.banner} />
						{room.phase === "countdown" && room.phaseEndsAt !== null && (
							<Countdown
								what={MODE_NAMES[room.mode].toLowerCase()}
								endsAt={room.phaseEndsAt}
								serverNow={match.serverNow}
							/>
						)}
						{room.phase === "roundEnd" && !me?.out && (
							<RoundBreak room={room} serverNow={match.serverNow} />
						)}
						{siege && live && me?.out && <OutOverlay me={me} onLeave={leave} />}
					</div>
				</div>
				<div className="mt-4">
					<WordTray
						word={match.word}
						status={match.wordStatus}
						preview={match.preview}
						popups={match.popups}
						rejectKey={match.rejectKey}
						locked={match.locked}
						onCast={match.cast}
						onClear={match.clear}
					/>
				</div>
			</section>

			<aside className="flex flex-col gap-5 border-t border-gold/20 pt-4 lg:col-start-3 lg:row-start-3 lg:border-0 lg:pt-0">
				{mine && <ProphecyScroll game={mine} />}
				<div className="flex items-center gap-3 lg:block">
					<Button
						variant="outline"
						disabled={match.locked}
						onClick={match.shuffle}
					>
						Shuffle
					</Button>
					<p className="text-sm text-vellum-dim lg:mt-2">
						New letters for every plain stone. Adds a curse rune.
					</p>
				</div>
				<NoxSays line={match.nox} />
				<Button
					variant="ghost"
					className="justify-start px-0 text-vellum-dim"
					onClick={leave}
				>
					{live && !me?.out
						? `Forfeit the ${MODE_NAMES[room.mode].toLowerCase()}`
						: "Leave the room"}
				</Button>
			</aside>

			{room.phase === "finished" && room.result && (
				<MatchResultDialog
					mode={room.mode}
					result={room.result}
					you={room.you}
					onRematch={match.rematch}
					onLeave={leave}
				/>
			)}
		</main>
	);
}
