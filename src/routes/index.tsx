import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { COLS, createGame, ROWS, toIndex } from "#/game";
import { loadDictionary } from "#/game/dictionary";

export const Route = createFileRoute("/")({ component: Home });

// Placeholder until the real title screen: shows the engine and word list working in the browser.
const preview = createGame({ mode: "classic", seed: "bookwar" });
const previewRows = Array.from({ length: ROWS }, (_, row) =>
	Array.from({ length: COLS }, (_, col) =>
		(preview.board[toIndex(col, row)]?.letter ?? "·").toUpperCase().padEnd(2),
	).join(" "),
).join("\n");

function Home() {
	const [words, setWords] = useState<string>("Opening the spellbook…");

	useEffect(() => {
		loadDictionary().then(
			(dictionary) =>
				setWords(`${dictionary.size.toLocaleString()} words in the spellbook`),
			() => setWords("The spellbook failed to load"),
		);
	}, []);

	return (
		<main className="mx-auto max-w-xl px-4 py-12">
			<h1 className="text-4xl font-bold">Bookwar</h1>
			<p className="mt-2 text-muted-foreground">
				Spellbook duel is under construction. Below is a sample board from the
				game engine.
			</p>
			<pre className="mt-6 font-mono text-lg leading-relaxed">
				{previewRows}
			</pre>
			<p className="mt-4 text-sm text-muted-foreground">
				Prophecy word: {preview.prophecy.word} · {words}
			</p>
		</main>
	);
}
