import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { Nox } from "#/components/brand/Nox";
import { CurseMeter } from "#/components/game/CurseMeter";
import { GameOver } from "#/components/game/GameOver";
import { HexBoard } from "#/components/game/HexBoard";
import { LevelBanner } from "#/components/game/LevelBanner";
import { NoxSays } from "#/components/game/NoxSays";
import { ProphecyScroll } from "#/components/game/ProphecyScroll";
import { ScorePanel } from "#/components/game/ScorePanel";
import { WordTray } from "#/components/game/WordTray";
import { Button } from "#/components/ui/button";
import type { Dictionary } from "#/game/dictionary";
import { useDictionary } from "#/hooks/useDictionary";
import { useSoloGame } from "#/hooks/useSoloGame";

const MODES = ["classic"] as const;
type SoloMode = (typeof MODES)[number];

const isSoloMode = (value: string): value is SoloMode =>
	(MODES as readonly string[]).includes(value);

export const Route = createFileRoute("/solo/$mode")({
	// The game lives entirely in the browser (word list, animations, keyboard).
	ssr: false,
	params: {
		parse: ({ mode }) => {
			if (!isSoloMode(mode)) throw notFound();
			return { mode };
		},
		stringify: ({ mode }) => ({ mode }),
	},
	// ?seed= replays a specific board, in development only.
	validateSearch: (search: Record<string, unknown>): { seed?: string } =>
		typeof search.seed === "string" ? { seed: search.seed } : {},
	head: () => ({ meta: [{ title: "Classic | Bookwar" }] }),
	component: SoloPage,
});

const newSeed = () => crypto.randomUUID().slice(0, 8);

function SoloPage() {
	const search = Route.useSearch();
	const words = useDictionary();
	const [seed, setSeed] = useState(() =>
		import.meta.env.DEV && search.seed ? search.seed : newSeed(),
	);

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
			key={seed}
			seed={seed}
			dictionary={words.dictionary}
			onNewGame={() => setSeed(newSeed())}
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
	seed,
	dictionary,
	onNewGame,
}: {
	seed: string;
	dictionary: Dictionary;
	onNewGame: () => void;
}) {
	const solo = useSoloGame(seed, dictionary);
	const { game } = solo;

	return (
		<main className="mx-auto grid max-w-6xl gap-x-10 gap-y-4 px-4 pt-3 pb-8 lg:grid-cols-[15rem_minmax(0,34rem)_15rem] lg:grid-rows-[auto_auto_1fr] lg:justify-center lg:pt-6">
			<header className="flex items-center justify-between lg:col-span-3">
				<Link
					to="/"
					className="font-display text-xl text-gold-bright hover:text-gold"
				>
					Bookwar
				</Link>
				<p className="text-sm text-vellum-dim">Classic</p>
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
				<div className="relative">
					<HexBoard
						board={game.board}
						selection={solo.selection}
						casting={solo.casting}
						rejectKey={solo.rejectKey}
						shuffleKey={solo.shuffleKey}
						locked={solo.locked}
						onPress={solo.press}
						onDrag={solo.drag}
						onRelease={solo.release}
						onCancel={solo.cancelGesture}
						onCastAnimated={solo.finishCast}
					/>
					<LevelBanner banner={solo.banner} />
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
					<p className="mt-3 text-xs text-vellum-dim/60">Seed {seed}</p>
				)}
			</section>

			<aside className="flex flex-col gap-5 border-t border-gold/20 pt-4 lg:col-start-3 lg:row-start-3 lg:border-0 lg:pt-0">
				<CurseMeter board={game.board} />
				<div className="flex items-center gap-3 lg:block">
					<Button
						variant="outline"
						disabled={solo.locked}
						onClick={solo.shuffle}
					>
						Shuffle
					</Button>
					<p className="text-sm text-vellum-dim lg:mt-2">
						New letters for every plain stone. Adds a curse rune.
					</p>
				</div>
				<NoxSays line={solo.nox} />
				<p className="hidden text-sm text-vellum-dim lg:block">
					Keyboard: type letters to trace a word, Enter to cast, Backspace to
					undo a letter, Esc to clear.
				</p>
			</aside>

			{game.status === "over" && (
				<GameOver game={game} onPlayAgain={onNewGame} />
			)}
		</main>
	);
}
