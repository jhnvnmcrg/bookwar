import type { WordList } from "../types";

/** Word lookups for the engine: exact matches plus prefix checks for the word finder. */
export class Dictionary implements WordList {
	readonly size: number;
	private readonly sorted: readonly string[];
	private readonly lookup: ReadonlySet<string>;

	constructor(words: Iterable<string>) {
		this.lookup = new Set(words);
		this.sorted = [...this.lookup].sort();
		this.size = this.sorted.length;
	}

	static fromText(text: string): Dictionary {
		return new Dictionary(text.split(/\r?\n/).filter((word) => word !== ""));
	}

	has(word: string): boolean {
		return this.lookup.has(word);
	}

	hasPrefix(prefix: string): boolean {
		let low = 0;
		let high = this.sorted.length;
		while (low < high) {
			const mid = (low + high) >>> 1;
			if (this.sorted[mid] < prefix) low = mid + 1;
			else high = mid;
		}
		return low < this.sorted.length && this.sorted[low].startsWith(prefix);
	}
}
