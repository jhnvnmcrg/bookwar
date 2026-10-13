import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
	dragOnto,
	pressStone,
	releaseOnSelected,
	typedLetters,
} from "#/components/game/selection";
import {
	type Board,
	findPath,
	type Letter,
	MIN_WORD_LETTERS,
	type Stone,
	scoreWord,
} from "#/game";
import type { Dictionary } from "#/game/dictionary";

export type WordStatus = "empty" | "short" | "valid" | "invalid";

interface Gesture {
	readonly pressed: number;
	readonly deferred: boolean;
	moved: boolean;
}

export interface WordSelectionOptions {
	/** The board as currently drawn. */
	readonly board: Board;
	/** The latest board, for event handlers (may be newer than the last render). */
	readonly getBoard: () => Board;
	readonly dictionary: Dictionary;
	/** No input while a cast is animating, the game is over or paused. */
	readonly locked: boolean;
	/** Cast the selected stones. `fromDrag`: the selection should clear if it fails. */
	readonly onCast: (path: readonly number[], fromDrag: boolean) => void;
	/** A typed letter has no touching stone to extend the word with. */
	readonly onTypeMiss: (key: string) => void;
}

/**
 * The stones a player is selecting, by tap, drag or typing, plus the word they spell. Shared
 * by Solo and Duel; what a cast does is up to the caller.
 */
export function useWordSelection({
	board,
	getBoard,
	dictionary,
	locked,
	onCast,
	onTypeMiss,
}: WordSelectionOptions) {
	const [selection, setSelectionState] = useState<readonly number[]>([]);
	const selectionRef = useRef<readonly number[]>([]);
	const [rejectKey, setRejectKey] = useState(0);
	const gesture = useRef<Gesture | null>(null);
	const lastKey = useRef("");

	const stones = selection
		.map((index) => board[index])
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
		const current = getBoard();
		return path.map((index) => current[index]?.letter ?? "").join("");
	}

	function cast(fromDrag = false) {
		const path = selectionRef.current;
		if (locked || path.length === 0) return;
		onCast(path, fromDrag);
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
		const current = getBoard();
		const path = selectionRef.current;
		const lastStone = current[path.at(-1) ?? -1];
		if (key === "u" && lastKey.current === "q" && lastStone?.letter === "qu") {
			lastKey.current = "u";
			return;
		}
		lastKey.current = key;
		const letters: Letter[] = [
			...path.flatMap((index) => {
				const stone = current[index];
				return stone ? [stone.letter] : [];
			}),
			...typedLetters(key),
		];
		const found = findPath(current, letters, path);
		if (found) {
			setSelection(found);
		} else {
			setRejectKey((count) => count + 1);
			onTypeMiss(key);
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

	return {
		selection,
		setSelection,
		word,
		wordOf,
		status,
		preview,
		rejectKey,
		/** Shake the selection and tray (a rejected word). */
		shake: () => setRejectKey((key) => key + 1),
		press,
		drag,
		release,
		cancelGesture,
		cast: () => cast(),
		clear: () => setSelection([]),
	};
}
