import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
	lineForMove,
	lineForRejection,
	type NoxLine,
	OPENING_LINE,
} from "#/components/game/nox-lines";
import {
	dragOnto,
	pressStone,
	releaseOnSelected,
	typedLetters,
} from "#/components/game/selection";
import {
	createGame,
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

interface Gesture {
	readonly pressed: number;
	readonly deferred: boolean;
	moved: boolean;
}

const POPUP_MS = 1200;
const BANNER_MS = 2700;

const formatPoints = (value: number) => value.toLocaleString("en-US");

/**
 * Runs one Solo Classic game in the browser: the engine state, the stones being selected
 * (by tap, drag or typing), and the feedback shown after each move.
 */
export function useSoloGame(seed: string, dictionary: Dictionary) {
	const [game, setGame] = useState<GameState>(() =>
		createGame({ mode: "classic", seed }),
	);
	const [selection, setSelectionState] = useState<readonly number[]>([]);
	const selectionRef = useRef<readonly number[]>([]);
	const [casting, setCasting] = useState<readonly number[] | null>(null);
	const pendingCast = useRef<GameState | null>(null);
	const pendingEvents = useRef<readonly GameEvent[]>([]);
	const [rejectKey, setRejectKey] = useState(0);
	const [shuffleKey, setShuffleKey] = useState(0);
	const [nox, setNox] = useState<NoxLine>(OPENING_LINE);
	const [popups, setPopups] = useState<readonly Popup[]>([]);
	const [banner, setBanner] = useState<Banner | null>(null);
	const gesture = useRef<Gesture | null>(null);
	const lastKey = useRef("");
	const nextFeedbackId = useRef(1);

	const over = game.status === "over";
	const locked = casting !== null || over;

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
		return path.map((index) => game.board[index]?.letter ?? "").join("");
	}

	function reject(error: PlayError, attempted: string, clear: boolean) {
		setRejectKey((key) => key + 1);
		setNox(lineForRejection(error, attempted));
		if (clear) setSelection([]);
	}

	function announce(events: readonly GameEvent[], next: GameState) {
		setNox(lineForMove(events, next.board));
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
		const result = reduce(game, { type: "play", path }, dictionary);
		if (!result.ok) {
			reject(result.error, wordOf(path), clearOnFail);
			return;
		}
		pendingCast.current = result.state;
		pendingEvents.current = result.events;
		setCasting(path);
	}

	/** Called by the board once the cast animation has played. */
	function finishCast() {
		const next = pendingCast.current;
		pendingCast.current = null;
		setCasting(null);
		if (!next) return;
		setGame(next);
		setSelection([]);
		announce(pendingEvents.current, next);
	}

	function shuffle() {
		if (locked) return;
		const result = reduce(game, { type: "shuffle" }, dictionary);
		if (!result.ok) return;
		setGame(result.state);
		setSelection([]);
		setShuffleKey((key) => key + 1);
		announce(result.events, result.state);
	}

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
		const path = selectionRef.current;
		const lastStone = game.board[path.at(-1) ?? -1];
		if (key === "u" && lastKey.current === "q" && lastStone?.letter === "qu") {
			lastKey.current = "u";
			return;
		}
		lastKey.current = key;
		const letters: Letter[] = [
			...path.flatMap((index) => {
				const stone = game.board[index];
				return stone ? [stone.letter] : [];
			}),
			...typedLetters(key),
		];
		const found = findPath(game.board, letters, path);
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
		finishCast,
	};
}
