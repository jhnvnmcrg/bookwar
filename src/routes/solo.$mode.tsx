import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
	type CSSProperties,
	type ReactNode,
	useEffect,
	useEffectEvent,
	useState,
} from "react";
import { z } from "zod";
import { Nox } from "#/components/brand/Nox";
import { CurseMeter } from "#/components/game/CurseMeter";
import { GameOver } from "#/components/game/GameOver";
import { HexBoard } from "#/components/game/HexBoard";
import { BOARD_ASPECT } from "#/components/game/hex-geometry";
import { LevelBanner } from "#/components/game/LevelBanner";
import { isSoloMode, SOLO_MODES } from "#/components/game/modes";
import { NoxSays } from "#/components/game/NoxSays";
import { ProphecyScroll } from "#/components/game/ProphecyScroll";
import { ScorePanel } from "#/components/game/ScorePanel";
import { SoundToggle } from "#/components/game/SoundToggle";
import { DropTimer, SpaceMeter } from "#/components/game/SpaceMeter";
import { WordTray } from "#/components/game/WordTray";
import { Button } from "#/components/ui/button";
import {
	createGame,
	type GameMode,
	type GameState,
	type MoveRecord,
} from "#/game";
import type { Dictionary } from "#/game/dictionary";
import { useLeaderboardEntry } from "#/hooks/useAccount";
import { useDictionary } from "#/hooks/useDictionary";
import { useSoloGame } from "#/hooks/useSoloGame";
import { prefersReducedMotion } from "#/lib/gsap";
import { loadMoves, loadSave } from "#/lib/guest-storage";

const searchSchema = z.object({
	/** Start a new game instead of continuing the saved one. */
	fresh: z.boolean().optional().catch(undefined),
	/** Development only: play a specific board. */
	seed: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/solo/$mode")({
	// The game lives entirely in the browser (word list, saves, animations, keyboard).
	ssr: false,
	params: {
		parse: ({ mode }) => {
			if (!isSoloMode(mode)) throw notFound();
			return { mode };
		},
		stringify: ({ mode }) => ({ mode }),
	},
	validateSearch: searchSchema,
	remountDeps: ({ params }) => params.mode,
	head: ({ params }) => ({
		meta: [{ title: `${SOLO_MODES[params.mode].name} | Bookwar` }],
	}),
	component: SoloPage,
});

const newSeed = () => crypto.randomUUID().slice(0, 8);

interface Start {
	readonly state: GameState;
	/** The moves that led to `state`; null for a saved game from before moves were logged. */
	readonly moves: readonly MoveRecord[] | null;
	/** True when continuing a saved game. */
	readonly resumed: boolean;
}

/** The saved game for this mode, unless a new one was asked for. */
function startingGame(
	mode: GameMode,
	search: z.infer<typeof searchSchema>,
): Start {
	if (import.meta.env.DEV && search.seed) {
		return {
			state: createGame({ mode, seed: search.seed }),
			moves: [],
			resumed: false,
		};
	}
	if (!search.fresh) {
		const saved = loadSave(mode);
		if (saved)
			return {
				state: saved,
				moves: loadMoves(mode, saved.seed),
				resumed: true,
			};
	}
	return {
		state: createGame({ mode, seed: newSeed() }),
		moves: [],
		resumed: false,
	};
}

function SoloPage() {
	const { mode } = Route.useParams();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const words = useDictionary();
	const [start, setStart] = useState(() => startingGame(mode, search));

	// ?fresh and ?seed only pick the starting game; drop them so a refresh continues it.
	const tidyUrl = useEffectEvent(() => {
		if (search.fresh !== undefined || search.seed !== undefined) {
			void navigate({ search: {}, replace: true });
		}
	});
	useEffect(() => tidyUrl(), []);

	if (words.status === "loading") {
		return (
			<CenteredMessage>
				<Nox mood="idle" className="mx-auto h-24 w-20" />
				<p className="mt-3 text-vellum-dim">Opening the spellbook…</p>
			</CenteredMessage>
		);
	}
	if (words.status === "failed") {
		return (
			<CenteredMessage>
				<Nox mood="worried" className="mx-auto h-24 w-20" />
				<p className="mt-3">
					The word list didn't load. Check your connection and try again.
				</p>
				<Button className="mt-4" onClick={words.retry}>
					Try again
				</Button>
			</CenteredMessage>
		);
	}
	return (
		<SoloGame
			key={start.state.seed}
			initial={start.state}
			moves={start.moves}
			resumed={start.resumed}
			dictionary={words.dictionary}
			onNewGame={() =>
				setStart({
					state: createGame({ mode, seed: newSeed() }),
					moves: [],
					resumed: false,
				})
			}
		/>
	);
}

function CenteredMessage({ children }: { children: ReactNode }) {
	return (
		<main className="grid min-h-dvh place-items-center p-4 text-center">
			<div>{children}</div>
		</main>
	);
}

function SoloGame({
	initial,
	moves,
	resumed,
	dictionary,
	onNewGame,
}: {
	initial: GameState;
	moves: readonly MoveRecord[] | null;
	resumed: boolean;
	dictionary: Dictionary;
	onNewGame: () => void;
}) {
	const solo = useSoloGame(initial, dictionary, {
		startPaused: resumed,
		moves,
	});
	const leaderboard = useLeaderboardEntry(initial.mode, solo.finished);
	const { game } = solo;
	const action = game.mode === "action";
	const over = game.status === "over";
	// The results wait until the stones have tumbled off the board.
	const [fallenShown, setFallenShown] = useState(false);
	useEffect(() => {
		if (!over) return;
		const timer = setTimeout(
			() => setFallenShown(true),
			prefersReducedMotion() ? 0 : 1400,
		);
		return () => clearTimeout(timer);
	}, [over]);

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
					<p className="text-sm text-vellum-dim">
						{SOLO_MODES[game.mode].name}
					</p>
					{action &&
						(solo.paused ? (
							<Button size="sm" onClick={solo.resume}>
								Resume
							</Button>
						) : (
							<Button
								size="sm"
								variant="outline"
								onClick={solo.pause}
								disabled={over}
							>
								Pause
							</Button>
						))}
					<SoundToggle />
				</div>
			</header>

			<aside className="lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:pt-2">
				<ScorePanel game={game} />
			</aside>

			<div className="lg:col-start-3 lg:row-start-2 lg:pt-2">
				<ProphecyScroll game={game} />
			</div>

			<section
				aria-label="Board"
				className="lg:col-start-2 lg:row-span-2 lg:row-start-2"
			>
				{/* Sized from the board's shape so it fits the screen height with the tray below. */}
				<div
					className="mx-auto max-w-[calc((100dvh-17rem)*var(--board-aspect))] lg:max-w-[calc((100dvh-16rem)*var(--board-aspect))]"
					style={{ "--board-aspect": BOARD_ASPECT } as CSSProperties}
				>
					{action && (
						<DropTimer clock={solo.dropClock} running={!solo.paused && !over} />
					)}
					<div className="relative">
						<HexBoard
							board={game.board}
							selection={solo.selection}
							casting={solo.casting}
							rejectKey={solo.rejectKey}
							shuffleKey={solo.shuffleKey}
							locked={solo.locked}
							dangerEdge={action ? "top" : "bottom"}
							glow={solo.glow}
							fallen={over}
							onPress={solo.press}
							onDrag={solo.drag}
							onRelease={solo.release}
							onCancel={solo.cancelGesture}
							onCastAnimated={solo.finishCast}
						/>
						<LevelBanner banner={solo.banner} />
						{solo.paused && (
							<div className="absolute inset-0 grid place-items-center rounded-[18px] bg-lapis-deep/95 text-center">
								<div>
									<p className="font-stone text-3xl font-bold text-vellum">
										Paused
									</p>
									<p className="mt-1 text-sm text-vellum-dim">
										Stones won't fall while the game is paused.
									</p>
									<Button className="mt-4" onClick={solo.resume}>
										Resume
									</Button>
								</div>
							</div>
						)}
					</div>
				</div>
				<div className="mt-4">
					<WordTray
						word={solo.word}
						status={solo.status}
						preview={solo.preview}
						popups={solo.popups}
						rejectKey={solo.rejectKey}
						locked={solo.locked}
						onCast={solo.cast}
						onClear={solo.clear}
					/>
				</div>
				{import.meta.env.DEV && (
					<p className="mt-3 text-xs text-vellum-dim/60">Seed {game.seed}</p>
				)}
			</section>

			<aside className="flex flex-col gap-5 border-t border-gold/20 pt-4 lg:col-start-3 lg:row-start-3 lg:border-0 lg:pt-0">
				{action ? (
					<SpaceMeter board={game.board} />
				) : (
					<CurseMeter board={game.board} />
				)}
				<div className="flex items-center gap-3 lg:block">
					<Button
						variant="outline"
						disabled={solo.locked}
						onClick={solo.shuffle}
					>
						Shuffle
					</Button>
					<p className="text-sm text-vellum-dim lg:mt-2">
						{SOLO_MODES[game.mode].shuffle}
					</p>
				</div>
				<NoxSays line={solo.nox} />
				<p className="hidden text-sm text-vellum-dim lg:block">
					Keyboard: type letters to trace a word, Enter to cast, Backspace to
					undo a letter, Esc to clear.
				</p>
			</aside>

			{over && fallenShown && (
				<GameOver
					game={game}
					place={solo.place}
					leaderboard={leaderboard}
					onPlayAgain={onNewGame}
				/>
			)}
		</main>
	);
}
