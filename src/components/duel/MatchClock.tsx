import { useEffect, useState } from "react";

/** Re-renders every `ms` while `active`, so clocks stay current. */
export function useTicker(active: boolean, ms = 250): void {
	const [, setTick] = useState(0);
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => setTick((tick) => tick + 1), ms);
		return () => clearInterval(timer);
	}, [active, ms]);
}

export function formatClock(ms: number): string {
	const total = Math.max(0, Math.ceil(ms / 1000));
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Time left in the duel, from the server's clock. Turns red in the last 30 seconds. */
export function MatchClock({
	endsAt,
	serverNow,
}: {
	endsAt: number | null;
	serverNow: () => number;
}) {
	useTicker(endsAt !== null);
	if (endsAt === null) return null;
	const left = endsAt - serverNow();
	return (
		<p
			role="timer"
			aria-label="Time left"
			className={`figures font-stone text-2xl font-bold ${left <= 30_000 ? "text-rubric" : "text-vellum"}`}
		>
			{formatClock(left)}
		</p>
	);
}

/** 3, 2, 1 over the board before a duel starts. */
export function Countdown({
	endsAt,
	serverNow,
}: {
	endsAt: number;
	serverNow: () => number;
}) {
	useTicker(true, 100);
	const seconds = Math.max(1, Math.ceil((endsAt - serverNow()) / 1000));
	return (
		<div className="absolute inset-0 z-10 grid place-items-center rounded-[18px] bg-lapis-deep/85">
			<div className="text-center">
				<p className="text-vellum-dim">The duel begins in</p>
				<p
					className="figures font-stone text-8xl font-bold text-gold-bright"
					aria-live="assertive"
				>
					{seconds}
				</p>
			</div>
		</div>
	);
}
