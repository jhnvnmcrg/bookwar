import { useEffect, useRef, useState } from "react";
import type { GameEvent } from "#/game";

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

const POPUP_MS = 1200;
const BANNER_MS = 2700;

const formatPoints = (value: number) => value.toLocaleString("en-US");

/** Floating points after a word and the rank-up banner. Shared by Solo and Duel. */
export function useMoveFeedback() {
	const [popups, setPopups] = useState<readonly Popup[]>([]);
	const [banner, setBanner] = useState<Banner | null>(null);
	const nextId = useRef(1);

	function show(events: readonly GameEvent[]) {
		const added: Popup[] = [];
		for (const event of events) {
			if (event.type === "word") {
				added.push({
					id: nextId.current++,
					text: `+${formatPoints(event.score)}`,
					kind: "score",
				});
			} else if (event.type === "prophecy-fulfilled") {
				added.push({
					id: nextId.current++,
					text: `+${formatPoints(event.bonus)} prophecy`,
					kind: "bonus",
				});
			} else if (event.type === "level-up") {
				setBanner({
					id: nextId.current++,
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

	useEffect(() => {
		if (!banner) return;
		const timer = setTimeout(() => setBanner(null), BANNER_MS);
		return () => clearTimeout(timer);
	}, [banner]);

	return { popups, banner, show };
}
