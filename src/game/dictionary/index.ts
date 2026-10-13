import { Dictionary } from "./dictionary";

export { Dictionary } from "./dictionary";

let loading: Promise<Dictionary> | undefined;

/**
 * Loads the full word list once. `?raw` makes it a lazy chunk in the browser and a bundled
 * string on the server, so both sides check words against the same list.
 */
export function loadDictionary(): Promise<Dictionary> {
	loading ??= import("./words.txt?raw")
		.then((module) => Dictionary.fromText(module.default))
		.catch((error: unknown) => {
			loading = undefined;
			throw error;
		});
	return loading;
}
