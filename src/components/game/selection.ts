// How taps and drags change the selected path. Pure, so the rules are easy to test.
import { areAdjacent, type Letter } from "#/game";

export type PressResult =
	| { readonly kind: "changed"; readonly selection: number[] }
	/** Pressed a stone already in the path: decided on release (cast or trim). */
	| { readonly kind: "deferred" };

/** Pointer down on a stone: extend the path if it touches the end, otherwise start over. */
export function pressStone(
	selection: readonly number[],
	index: number,
): PressResult {
	if (selection.includes(index)) return { kind: "deferred" };
	const last = selection.at(-1);
	if (last !== undefined && areAdjacent(last, index)) {
		return { kind: "changed", selection: [...selection, index] };
	}
	return { kind: "changed", selection: [index] };
}

/** Dragging onto a stone: step back onto the previous stone, or extend to a touching one. */
export function dragOnto(
	selection: readonly number[],
	index: number,
): readonly number[] {
	const last = selection.at(-1);
	if (last === undefined || index === last) return selection;
	if (index === selection.at(-2)) return selection.slice(0, -1);
	if (!selection.includes(index) && areAdjacent(last, index)) {
		return [...selection, index];
	}
	return selection;
}

export type ReleaseResult =
	| { readonly kind: "cast" }
	| { readonly kind: "changed"; readonly selection: number[] };

/** Tap released on a stone that was already selected. */
export function releaseOnSelected(
	selection: readonly number[],
	index: number,
): ReleaseResult {
	if (index === selection.at(-1)) {
		return selection.length >= 2
			? { kind: "cast" }
			: { kind: "changed", selection: [] };
	}
	return {
		kind: "changed",
		selection: selection.slice(0, selection.indexOf(index) + 1),
	};
}

/** Typed text as stone letters. "q" stands for the Qu stone; a "u" right after it is skipped. */
export function typedLetters(text: string): Letter[] {
	const letters: Letter[] = [];
	const lower = text.toLowerCase();
	for (let i = 0; i < lower.length; i++) {
		const char = lower[i];
		if (char === "q") {
			letters.push("qu");
			if (lower[i + 1] === "u") i++;
		} else if (char >= "a" && char <= "z") {
			letters.push(char as Letter);
		}
	}
	return letters;
}
