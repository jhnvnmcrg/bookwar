import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
	dangerLine,
	lineForMove,
	lineForRejection,
	type NoxLine,
	openingLine,
} from "#/components/game/nox-lines";
import {
	dropInterval,
	encodeMove,
	type GameAction,
	type GameEvent,
	type GameState,
	type MoveRecord,
	reduce,
} from "#/game";
import type { Dictionary } from "#/game/dictionary";
import {
	clearSave,
	recordScore,
	type ScoreEntry,
	saveGame,
	saveMoves,
	scoreEntryFor,
} from "#/lib/guest-storage";
import { playSound } from "#/lib/sound";
import { useMoveFeedback } from "./useMoveFeedback";
import { useWordSelection } from "./useWordSelection";

export type { Banner, Glow, Popup } from "./useMoveFeedback";
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
	{
		startPaused = false,
		moves: initialMoves = [],
	}: {
		/** Continued Action games open paused, so stones don't fall before the player is ready. */
		startPaused?: boolean;
		/** The moves that led to `initial`; null when they weren't logged (an older save). */
		moves?: readonly MoveRecord[] | null;
	} = {},
) {
	const [game, setGameState] = useState(initial);
	/** Handlers read the game from here so a move never applies to a stale state. */
	const gameRef = useRef(initial);
	/** Every move so far, so the finished game can be replayed to check its score. */
	const movesRef = useRef<MoveRecord[] | null>(
		initialMoves ? [...initialMoves] : null,
	);
	/** The high-score entry once the game is over. */
	const [finished, setFinished] = useState<ScoreEntry | null>(null);
	const [casting, setCasting] = useState<readonly number[] | null>(null);
	const pendingCast = useRef<{
		action: GameAction;
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

	/** Applies a move's result: saves it, or records the score when the game just ended. */
	function commit(next: GameState, action: GameAction) {
		gameRef.current = next;
		setGameState(next);
		const moves = movesRef.current;
		moves?.push(encodeMove(action));
		if (next.status === "playing") {
			saveGame(next);
			if (moves) saveMoves(next.mode, next.seed, moves);
		} else {
			clearSave(next.mode);
			const entry = scoreEntryFor(next, new Date(), moves ?? undefined);
			setPlace(recordScore(next.mode, entry));
			setFinished(entry);
		}
	}

	function announce(events: readonly GameEvent[], next: GameState) {
		setNox(lineForMove(events, next));
		feedback.show(events);
	}

	/** Checks the word; if it's valid, the board plays the cast animation first. */
	function cast(path: readonly number[], fromDrag: boolean) {
		const action: GameAction = { type: "play", path };
		const result = reduce(gameRef.current, action, dictionary);
		if (!result.ok) {
			words.shake();
			setNox(lineForRejection(result.error, words.wordOf(path)));
			if (fromDrag) words.clear();
			return;
		}
		pendingCast.current = {
			action,
			state: result.state,
			events: result.events,
		};
		playSound("cast", words.wordOf(path).length);
		setCasting(path);
	}

	/** Called by the board once the cast animation has played. */
	function finishCast() {
		const pending = pendingCast.current;
		pendingCast.current = null;
		setCasting(null);
		if (!pending) return;
		commit(pending.state, pending.action);
		words.clear();
		announce(pending.events, pending.state);
	}

	function shuffle() {
		if (locked) return;
		const action: GameAction = { type: "shuffle" };
		const result = reduce(gameRef.current, action, dictionary);
		if (!result.ok) return;
		commit(result.state, action);
		words.clear();
		setShuffleKey((key) => key + 1);
		announce(result.events, result.state);
	}

	// --- Action mode clock -------------------------------------------------------------

	/** One clock tick: drop a stone. Returns false once the game is over. */
	const dropNow = useEffectEvent((): boolean => {
		const action: GameAction = { type: "tick" };
		const result = reduce(gameRef.current, action, dictionary);
		if (!result.ok) return false;
		const next = result.state;
		commit(next, action);
		if (next.status === "playing") playSound("drop");
		else feedback.show(result.events);
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
		const state = gameRef.current;
		if (state.status !== "playing") return;
		saveGame(state);
		if (movesRef.current) saveMoves(state.mode, state.seed, movesRef.current);
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
		finished,
		rejectKey: words.rejectKey,
		shuffleKey,
		nox,
		popups: feedback.popups,
		banner: feedback.banner,
		glow: feedback.glow,
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
