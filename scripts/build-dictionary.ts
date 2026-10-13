// Builds src/game/dictionary/words.txt from the public-domain ENABLE1 word list.
//
//   npm run build:dictionary -- path/to/enable1.txt
//
// Keeps 3–15 letter a–z words, drops words with a "q" not followed by "u" (the board only has
// a "Qu" stone) and anything in the blocklist, then writes them sorted with LF line endings.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BLOCKED_WORDS } from "../src/game/dictionary/blocklist";

const input = process.argv[2];
if (!input) {
	console.error("Usage: npm run build:dictionary -- <path-to-enable1.txt>");
	process.exit(1);
}

const words = new Set<string>();
let dropped = 0;
for (const line of readFileSync(input, "utf8").split(/\r?\n/)) {
	const word = line.trim().toLowerCase();
	if (!word) continue;
	if (
		!/^[a-z]{3,15}$/.test(word) ||
		/q(?!u)/.test(word) ||
		BLOCKED_WORDS.has(word)
	) {
		dropped++;
		continue;
	}
	words.add(word);
}

const output = resolve(import.meta.dirname, "../src/game/dictionary/words.txt");
const sorted = [...words].sort();
writeFileSync(output, `${sorted.join("\n")}\n`, "utf8");
console.log(`Wrote ${sorted.length} words to ${output} (dropped ${dropped}).`);
