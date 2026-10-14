import { useEffect, useRef, useState } from "react";
import type { GameEvent } from "#/game";
import { playSound, type SoundName } from "#/lib/sound";

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

/** Stones the board should make shine (new crystals); `key` changes each time. */
export interface Glow {
	readonly key: number;
	readonly ids: readonly number[];
}

/** The sound for each kind of event (the cast itself sounds when the spell starts). */
const EVENT_SOUNDS: Partial<Record<GameEvent["type"], SoundName>> = {
	"crystal-formed": "crystal",
	"prophecy-fulfilled": "prophecy",
	"level-up": "levelUp",
	"curse-appeared": "curse",
	"tower-fell": "towerFall",
	buried: "towerFall",
	shuffled: "shuffle",
};

const POPUP_MS = 1200;
const BANNER_MS = 2700;

const formatPoints = (value: number) => value.toLocaleString("en-US");

/**
 * What a move looks and sounds like: floating points, the rank-up banner, shining new
 * crystals and the sounds. Shared by Solo and live matches.
 */
export function useMoveFeedback() {
	const [popups, setPopups] = useState<readonly Popup[]>([]);
	const [banner, setBanner] = useState<Banner | null>(null);
	const [glow, setGlow] = useState<Glow>({ key: 0, ids: [] });
	const nextId = useRef(1);

	function show(events: readonly GameEvent[]) {
		const sounds = new Set<SoundName>();
		for (const event of events) {
			const sound = EVENT_SOUNDS[event.type];
			if (sound) sounds.add(sound);
		}
		for (const sound of sounds) playSound(sound);
		const crystals = events.flatMap((event) =>
			event.type === "crystal-formed" ? [event.id] : [],
		);
		if (crystals.length > 0) setGlow({ key: nextId.current++, ids: crystals });

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

	return { popups, banner, glow, show };
}
