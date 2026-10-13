import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
	dangerLine,
	lineForMove,
	lineForRejection,
	type NoxLine,
	openingLine,
} from "#/components/game/nox-lines";
import { dropInterval, type GameEvent, type GameState, reduce } from "#/game";
import type { Dictionary } from "#/game/dictionary";
import {
	clearSave,
	recordScore,
	saveGame,
	scoreEntryFor,
} from "#/lib/guest-storage";
import { useMoveFeedback } from "./useMoveFeedback";
import { useWordSelection } from "./useWordSelection";

export type { Banner, Popup } from "./useMoveFeedback";
export type { WordStatus } from "./useWordSelection";

/** Drives the "next stone" bar in Action mode: restart on `key`, run for `durationMs`. */
export interface DropClock {
	readonly key: number;
	readonly durationMs: number;
}

/**
 * Runs one Solo game in the browser: the engine state, the selected stones, Action mode's
 * falling-stone clock, saving after every move, and the feedback shown after each move.
 */
export function useSoloGame(
	initial: GameState,
	dictionary: Dictionary,
	/** Continued Action games open paused, so stones don't fall before the player is ready. */
	{ startPaused = false }: { startPaused?: boolean } = {},
) {
	const [game, setGameState] = useState(initial);
	/** Handlers read the game from here so a move never applies to a stale state. */
	const gameRef = useRef(initial);
	const [casting, setCasting] = useState<readonly number[] | null>(null);
	const pendingCast = useRef<{
		state: GameState;
		events: readonly GameEvent[];
	} | null>(null);
	const [shuffleKey, setShuffleKey] = useState(0);
	const [nox, setNox] = useState<NoxLine>(() => openingLine(initial.mode));
	/** Place on the local high-score list once the game ends (null: didn't make the list). */
	const [place, setPlace] = useState<number | null>(null);
	const [paused, setPaused] = useState(
		startPaused && initial.mode === "action" && initial.status === "playing",
	);
	const [dropClock, setDropClock] = useState<DropClock>(() => ({
		key: 0,
		durationMs: dropInterval(initial.level),
	}));
	const nextDropAt = useRef<number | null>(null);
	const pausedRemaining = useRef<number | null>(null);
	const feedback = useMoveFeedback();

	const action = game.mode === "action";
	const over = game.status === "over";
	const locked = casting !== null || over || paused;

	const words = useWordSelection({
		board: game.board,
		getBoard: () => gameRef.current.board,
		dictionary,
		locked,
		onCast: cast,
		onTypeMiss: (key) =>
			setNox({
				mood: "idle",
				text: `No “${key.toUpperCase()}” touches the end of your word.`,
			}),
	});

	/** Applies a new state: saves it, or records the score when the game just ended. */
	function commit(next: GameState) {
		gameRef.current = next;
		setGameState(next);
		if (next.status === "playing") {
			saveGame(next);
		} else {
			clearSave(next.mode);
			setPlace(recordScore(next.mode, scoreEntryFor(next, new Date())));
		}
	}

	function announce(events: readonly GameEvent[], next: GameState) {
		setNox(lineForMove(events, next));
		feedback.show(events);
	}

	/** Checks the word; if it's valid, the board plays the cast animation first. */
	function cast(path: readonly number[], fromDrag: boolean) {
		const result = reduce(gameRef.current, { type: "play", path }, dictionary);
		if (!result.ok) {
			words.shake();
			setNox(lineForRejection(result.error, words.wordOf(path)));
			if (fromDrag) words.clear();
			return;
		}
		pendingCast.current = { state: result.state, events: result.events };
		setCasting(path);
	}

	/** Called by the board once the cast animation has played. */
	function finishCast() {
		const pending = pendingCast.current;
		pendingCast.current = null;
		setCasting(null);
		if (!pending) return;
		commit(pending.state);
		words.clear();
		announce(pending.events, pending.state);
	}

	function shuffle() {
		if (locked) return;
		const result = reduce(gameRef.current, { type: "shuffle" }, dictionary);
		if (!result.ok) return;
		commit(result.state);
		words.clear();
		setShuffleKey((key) => key + 1);
		announce(result.events, result.state);
	}

	// --- Action mode clock -------------------------------------------------------------

	/** One clock tick: drop a stone. Returns false once the game is over. */
	const dropNow = useEffectEvent((): boolean => {
		const result = reduce(gameRef.current, { type: "tick" }, dictionary);
		if (!result.ok) return false;
		const next = result.state;
		commit(next);
		const duration = dropInterval(next.level);
		nextDropAt.current = Date.now() + duration;
		setDropClock((clock) => ({ key: clock.key + 1, durationMs: duration }));
		// Ticks only speak up when something is wrong; otherwise Nox keeps the last line.
		const warning =
			next.status === "over"
				? lineForMove(result.events, next)
				: dangerLine(next);
		if (warning)
			setNox((line) => (line.text === warning.text ? line : warning));
		return next.status === "playing";
	});

	const firstDelay = useEffectEvent(() => dropInterval(gameRef.current.level));

	const ticking = action && !over && !paused;
	const castPending = casting !== null;
	useEffect(() => {
		// A drop that comes due mid-cast waits for the cast to land, then falls straight away.
		if (!ticking || castPending) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const schedule = () => {
			nextDropAt.current ??= Date.now() + firstDelay();
			timer = setTimeout(
				() => {
					if (dropNow()) schedule();
				},
				Math.max(0, nextDropAt.current - Date.now()),
			);
		};
		schedule();
		return () => clearTimeout(timer);
	}, [ticking, castPending]);

	function pause() {
		if (!action || over || paused) return;
		pausedRemaining.current =
			nextDropAt.current === null
				? null
				: Math.max(0, nextDropAt.current - Date.now());
		setPaused(true);
		words.cancelGesture();
	}

	function resume() {
		if (!paused) return;
		if (pausedRemaining.current !== null) {
			nextDropAt.current = Date.now() + pausedRemaining.current;
		}
		pausedRemaining.current = null;
		setPaused(false);
	}

	// Leaving the tab pauses Action mode so stones don't pile up unseen.
	const onVisibilityChange = useEffectEvent(() => {
		if (document.hidden) pause();
	});
	useEffect(() => {
		const handler = () => onVisibilityChange();
		document.addEventListener("visibilitychange", handler);
		return () => document.removeEventListener("visibilitychange", handler);
	}, []);

	// Save the starting state too, so leaving before the first move still offers Continue.
	const saveInitial = useEffectEvent(() => {
		if (gameRef.current.status === "playing") saveGame(gameRef.current);
	});
	useEffect(() => saveInitial(), []);

	return {
		game,
		selection: words.selection,
		word: words.word,
		status: words.status,
		preview: words.preview,
		casting,
		locked,
		paused,
		dropClock,
		place,
		rejectKey: words.rejectKey,
		shuffleKey,
		nox,
		popups: feedback.popups,
		banner: feedback.banner,
		press: words.press,
		drag: words.drag,
		release: words.release,
		cancelGesture: words.cancelGesture,
		cast: words.cast,
		clear: words.clear,
		shuffle,
		pause,
		resume,
		finishCast,
	};
}
