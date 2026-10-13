// Player names: tidy them up and keep slurs and profanity out of other players' screens.
import { BLOCKED_WORDS } from "../game/dictionary/blocklist";

export const NAME_MIN = 2;
export const NAME_MAX = 16;

/**
 * Roots that are never acceptable anywhere inside a name, even glued to other letters. Only
 * roots that rarely hide inside ordinary names: not "cock" (Hancock), "rapist" (Therapist) or
 * "nazi" (Nazir); those are still blocked as whole words by the blocklist.
 */
const BLOCKED_ROOTS = [
	"fuck",
	"shit",
	"cunt",
	"nigg",
	"fagg",
	"bitch",
	"whore",
	"slut",
	"pussy",
	"penis",
	"vagina",
	"hitler",
];

/** Collapses whitespace and trims. */
export function tidyName(raw: string): string {
	return raw.replace(/\s+/g, " ").trim();
}

export type NameProblem =
	| "too-short"
	| "too-long"
	| "bad-characters"
	| "not-allowed";

/** Why a (tidied) name can't be used, or null when it's fine. */
export function nameProblem(name: string): NameProblem | null {
	if (name.length < NAME_MIN) return "too-short";
	if (name.length > NAME_MAX) return "too-long";
	if (!/^[\p{L}\p{N}][\p{L}\p{N} '_-]*$/u.test(name)) return "bad-characters";
	const lower = name.toLowerCase();
	const words = lower.split(/[^\p{L}]+/u).filter(Boolean);
	if (words.some((word) => BLOCKED_WORDS.has(word))) return "not-allowed";
	// Catch tricks like "f_u_c_k" or "xxfuckxx" and simple digit swaps.
	const squashed = lower
		.replace(/0/g, "o")
		.replace(/1/g, "i")
		.replace(/3/g, "e")
		.replace(/4/g, "a")
		.replace(/5/g, "s")
		.replace(/[^\p{L}]/gu, "");
	if (BLOCKED_ROOTS.some((root) => squashed.includes(root)))
		return "not-allowed";
	return null;
}
