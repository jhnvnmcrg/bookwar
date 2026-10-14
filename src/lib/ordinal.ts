/** 1 → "1st", 22 → "22nd", 113 → "113th". */
export function ordinal(n: number): string {
	const lastTwo = n % 100;
	if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
	return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
