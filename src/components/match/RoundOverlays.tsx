import { Button } from "#/components/ui/button";
import type { RoomView, SeatView } from "#/shared/protocol";
import { useTicker } from "./MatchClock";

const Overlay = ({ children }: { children: React.ReactNode }) => (
	<div className="absolute inset-0 z-10 grid place-items-center rounded-[18px] bg-lapis-deep/90 p-6 text-center">
		<div className="max-w-xs">{children}</div>
	</div>
);

/** Siege: between rounds, who was cut and when the next round starts. */
export function RoundBreak({
	room,
	serverNow,
}: {
	room: RoomView;
	serverNow: () => number;
}) {
	useTicker(true, 200);
	const cut = room.seats.find((seat) => seat.seatId === room.cut?.seatId);
	const seconds = Math.max(
		1,
		Math.ceil(((room.phaseEndsAt ?? 0) - serverNow()) / 1000),
	);
	return (
		<Overlay>
			<p className="text-vellum-dim">
				Round {room.cut?.round ?? room.round} is over
			</p>
			<p
				className="mt-2 font-stone text-3xl font-bold text-vellum"
				aria-live="assertive"
			>
				{cut?.seatId === room.you
					? "You were cut"
					: `${cut?.name ?? "A wizard"} was cut`}
			</p>
			<p className="mt-1 text-sm text-vellum-dim">Lowest score this round.</p>
			<p className="mt-5 text-vellum">
				Round {room.round + 1} starts in{" "}
				<span className="figures font-bold">{seconds}</span>
			</p>
		</Overlay>
	);
}

/** Siege: you're out, but the others play on. */
export function OutOverlay({
	me,
	onLeave,
}: {
	me: SeatView;
	onLeave: () => void;
}) {
	const round = me.outRound ? ` in round ${me.outRound}` : "";
	const why =
		me.out === "tower"
			? `A curse reached the bottom of your board${round}.`
			: me.out === "left"
				? `You left${round}.`
				: `You had the lowest score${round}.`;
	return (
		<Overlay>
			<p className="font-stone text-3xl font-bold text-vellum">You're out</p>
			<p className="mt-1 text-vellum-dim">{why}</p>
			<p className="mt-4 text-sm text-vellum-dim">
				Watch the rest of the siege, or leave now. Your place counts either way.
			</p>
			<Button className="mt-4" variant="outline" onClick={onLeave}>
				Leave the siege
			</Button>
		</Overlay>
	);
}
