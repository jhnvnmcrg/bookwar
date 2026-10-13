import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
	dangerLine,
	lineForMove,
	lineForRejection,
	type NoxLine,
	openingLine,
} from "#/components/game/nox-lines";
import {
	dragOnto,
	pressStone,
	releaseOnSelected,
	typedLetters,
} from "#/components/game/selection";
import {
	dropInterval,
	findPath,
	type GameEvent,
	type GameState,
	type Letter,
	MIN_WORD_LETTERS,
	type PlayError,
	reduce,
	type Stone,
	scoreWord,
} from "#/game";
import type { Dictionary } from "#/game/dictionary";
import {
	clearSave,
	recordScore,
	saveGame,
	scoreEntryFor,
} from "#/lib/guest-storage";

export type WordStatus = "empty" | "short" | "valid" | "invalid";

export interface Popup {
	readonly id: number;
	readonly text: string;
	readonly kind: "score" | "bonus";
}

export interface Banner {
	readonly id: number;
	readonly title: string;
	readonly detail: string;
}

/** Drives the "next stone" bar in Action mode: restart on `key`, run for `durationMs`. */
export interface DropClock {
	readonly key: number;
	readonly durationMs: number;
}

interface Gesture {
	readonly pressed: number;
	readonly deferred: boolean;
	moved: boolean;
}

const POPUP_MS = 1200;
const BANNER_MS = 2700;

const formatPoints = (value: number) => value.toLocaleString("en-US");

/**
 * Runs one Solo game in the browser: the engine state, the stones being selected (by tap,
 * drag or typing), Action mode's falling-stone clock, saving after every move, and the
 * feedback shown after each move.
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
	const [selection, setSelectionState] = useState<readonly number[]>([]);
	const selectionRef = useRef<readonly number[]>([]);
	const [casting, setCasting] = useState<readonly number[] | null>(null);
	const pendingCast = useRef<{
		state: GameState;
		events: readonly GameEvent[];
	} | null>(null);
	const [rejectKey, setRejectKey] = useState(0);
	const [shuffleKey, setShuffleKey] = useState(0);
	const [nox, setNox] = useState<NoxLine>(() => openingLine(initial.mode));
	const [popups, setPopups] = useState<readonly Popup[]>([]);
	const [banner, setBanner] = useState<Banner | null>(null);
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
	const gesture = useRef<Gesture | null>(null);
	const lastKey = useRef("");
	const nextFeedbackId = useRef(1);

	const action = game.mode === "action";
	const over = game.status === "over";
	const locked = casting !== null || over || paused;

	const stones = selection
		.map((index) => game.board[index])
		.filter((stone): stone is Stone => stone !== null && stone !== undefined);
	const word = stones.map((stone) => stone.letter).join("");
	const status: WordStatus =
		word.length === 0
			? "empty"
			: word.length < MIN_WORD_LETTERS
				? "short"
				: dictionary.has(word)
					? "valid"
					: "invalid";
	const preview = status === "valid" ? scoreWord(stones).total : 0;

	function setSelection(next: readonly number[]) {
		selectionRef.current = next;
		setSelectionState(next);
	}

	function wordOf(path: readonly number[]): string {
		return path
			.map((index) => gameRef.current.board[index]?.letter ?? "")
			.join("");
	}

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

	function reject(error: PlayError, attempted: string, clear: boolean) {
		setRejectKey((key) => key + 1);
		setNox(lineForRejection(error, attempted));
		if (clear) setSelection([]);
	}

	function announce(events: readonly GameEvent[], next: GameState) {
		setNox(lineForMove(events, next));
		const added: Popup[] = [];
		for (const event of events) {
			if (event.type === "word") {
				added.push({
					id: nextFeedbackId.current++,
					text: `+${formatPoints(event.score)}`,
					kind: "score",
				});
			} else if (event.type === "prophecy-fulfilled") {
				added.push({
					id: nextFeedbackId.current++,
					text: `+${formatPoints(event.bonus)} prophecy`,
					kind: "bonus",
				});
			} else if (event.type === "level-up") {
				setBanner({
					id: nextFeedbackId.current++,
					title: event.rank,
					detail: `Level ${event.level}. New prophecy: “${event.prophecy}”.`,
				});
			}
		}
		if (added.length > 0) {
			const ids = new Set(added.map((popup) => popup.id));
			setPopups((current) => [...current, ...added]);
			setTimeout(
				() =>
					setPopups((current) => current.filter((popup) => !ids.has(popup.id))),
				POPUP_MS,
			);
		}
	}

	/** Checks the selected word; if it's valid, the board plays the cast animation first. */
	function cast(clearOnFail = false) {
		const path = selectionRef.current;
		if (locked || path.length === 0) return;
		const result = reduce(gameRef.current, { type: "play", path }, dictionary);
		if (!result.ok) {
			reject(result.error, wordOf(path), clearOnFail);
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
		setSelection([]);
		announce(pending.events, pending.state);
	}

	function shuffle() {
		if (locked) return;
		const result = reduce(gameRef.current, { type: "shuffle" }, dictionary);
		if (!result.ok) return;
		commit(result.state);
		setSelection([]);
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
		gesture.current = null;
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

	// --- Input --------------------------------------------------------------------------

	function press(index: number) {
		if (locked) return;
		const result = pressStone(selectionRef.current, index);
		if (result.kind === "deferred") {
			gesture.current = { pressed: index, deferred: true, moved: false };
		} else {
			setSelection(result.selection);
			gesture.current = { pressed: index, deferred: false, moved: false };
		}
	}

	function drag(index: number) {
		const current = gesture.current;
		if (!current || locked) return;
		const next = dragOnto(selectionRef.current, index);
		if (next !== selectionRef.current) {
			setSelection(next);
			current.moved = true;
		}
	}

	/** A drag casts on release once it spells three letters; a tap may cast or trim. */
	function release() {
		const current = gesture.current;
		gesture.current = null;
		if (!current || locked) return;
		if (current.moved) {
			if (wordOf(selectionRef.current).length >= MIN_WORD_LETTERS) cast(true);
			return;
		}
		if (current.deferred) {
			const result = releaseOnSelected(selectionRef.current, current.pressed);
			if (result.kind === "cast") cast();
			else setSelection(result.selection);
		}
	}

	function cancelGesture() {
		gesture.current = null;
	}

	function typeKey(key: string) {
		const board = gameRef.current.board;
		const path = selectionRef.current;
		const lastStone = board[path.at(-1) ?? -1];
		if (key === "u" && lastKey.current === "q" && lastStone?.letter === "qu") {
			lastKey.current = "u";
			return;
		}
		lastKey.current = key;
		const letters: Letter[] = [
			...path.flatMap((index) => {
				const stone = board[index];
				return stone ? [stone.letter] : [];
			}),
			...typedLetters(key),
		];
		const found = findPath(board, letters, path);
		if (found) {
			setSelection(found);
		} else {
			setRejectKey((count) => count + 1);
			setNox({
				mood: "idle",
				text: `No “${key.toUpperCase()}” touches the end of your word.`,
			});
		}
	}

	const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const target = event.target instanceof Element ? event.target : null;
		if (target?.closest("input, textarea, select, [contenteditable='true']"))
			return;
		if (event.key === "Enter") {
			if (target?.closest("button, a")) return;
			event.preventDefault();
			cast();
		} else if (event.key === "Escape") {
			setSelection([]);
		} else if (event.key === "Backspace") {
			event.preventDefault();
			lastKey.current = "";
			setSelection(selectionRef.current.slice(0, -1));
		} else if (/^[a-z]$/i.test(event.key) && !locked) {
			typeKey(event.key.toLowerCase());
		}
	});

	useEffect(() => {
		const handler = (event: KeyboardEvent) => onKeyDown(event);
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	useEffect(() => {
		if (!banner) return;
		const timer = setTimeout(() => setBanner(null), BANNER_MS);
		return () => clearTimeout(timer);
	}, [banner]);

	return {
		game,
		selection,
		word,
		status,
		preview,
		casting,
		locked,
		paused,
		dropClock,
		place,
		rejectKey,
		shuffleKey,
		nox,
		popups,
		banner,
		press,
		drag,
		release,
		cancelGesture,
		cast: () => cast(),
		clear: () => setSelection([]),
		shuffle,
		pause,
		resume,
		finishCast,
	};
}
