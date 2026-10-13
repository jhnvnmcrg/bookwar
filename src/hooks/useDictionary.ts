import { useEffect, useState } from "react";
import { type Dictionary, loadDictionary } from "#/game/dictionary";

type DictionaryState =
	| { readonly status: "loading" }
	| { readonly status: "ready"; readonly dictionary: Dictionary }
	| { readonly status: "failed" };

/** Loads the word list in the browser; `retry` tries again after a failed download. */
export function useDictionary() {
	const [attempt, setAttempt] = useState(0);
	const [state, setState] = useState<DictionaryState>({ status: "loading" });

	// biome-ignore lint/correctness/useExhaustiveDependencies: bumping `attempt` re-runs the load
	useEffect(() => {
		let active = true;
		setState({ status: "loading" });
		loadDictionary().then(
			(dictionary) => {
				if (active) setState({ status: "ready", dictionary });
			},
			() => {
				if (active) setState({ status: "failed" });
			},
		);
		return () => {
			active = false;
		};
	}, [attempt]);

	return { ...state, retry: () => setAttempt((n) => n + 1) };
}
