import { useRef } from "react";
import { Button } from "#/components/ui/button";
import type { Popup, WordStatus } from "#/hooks/useSoloGame";
import { gsap, prefersReducedMotion, useGSAP } from "#/lib/gsap";

const HINTS: Record<WordStatus, string> = {
	empty: "Tap touching stones, drag across them, or type a word.",
	short: "Words need at least three letters.",
	valid: "Cast it, or tap the last stone again.",
	invalid: "Not in the spellbook.",
};

export function WordTray({
	word,
	status,
	preview,
	popups,
	rejectKey,
	locked,
	onCast,
	onClear,
}: {
	word: string;
	status: WordStatus;
	preview: number;
	popups: readonly Popup[];
	rejectKey: number;
	locked: boolean;
	onCast: () => void;
	onClear: () => void;
}) {
	const trayRef = useRef<HTMLDivElement>(null);

	useGSAP(
		() => {
			if (rejectKey === 0 || prefersReducedMotion() || !trayRef.current) return;
			gsap.fromTo(
				trayRef.current,
				{ x: -8 },
				{ x: 0, duration: 0.45, ease: "elastic.out(1, 0.3)" },
			);
		},
		{ dependencies: [rejectKey], scope: trayRef },
	);

	return (
		<div ref={trayRef} className="relative">
			<div className="flex min-h-14 items-baseline justify-between gap-4 border-b border-gold/40 pb-2">
				<p
					className={`font-stone text-3xl tracking-[0.12em] uppercase sm:text-4xl ${
						status === "valid"
							? "text-gold-bright"
							: status === "invalid"
								? "text-vellum-dim"
								: "text-vellum"
					}`}
				>
					{word || (
						<span className="text-vellum-dim/50 normal-case tracking-normal">
							…
						</span>
					)}
				</p>
				{status === "valid" && (
					<p className="figures text-xl font-bold text-gold">
						+{preview.toLocaleString("en-US")}
					</p>
				)}
			</div>
			<p
				className={`mt-2 text-sm ${status === "invalid" ? "text-rubric" : "text-vellum-dim"}`}
			>
				{HINTS[status]}
			</p>

			<div className="mt-3 flex gap-3">
				<Button
					size="lg"
					className="min-w-28 font-bold"
					disabled={locked || status !== "valid"}
					onClick={onCast}
				>
					Cast
				</Button>
				<Button
					size="lg"
					variant="outline"
					disabled={locked || status === "empty"}
					onClick={onClear}
				>
					Clear
				</Button>
			</div>

			<div
				className="pointer-events-none absolute -top-2 right-0"
				aria-hidden="true"
			>
				{popups.map((popup, i) => (
					<span
						key={popup.id}
						className={`float-up figures absolute right-0 whitespace-nowrap font-bold ${
							popup.kind === "bonus"
								? "text-2xl text-gold-bright"
								: "text-xl text-gold"
						}`}
						style={{ top: i * -30 }}
					>
						{popup.text}
					</span>
				))}
			</div>
		</div>
	);
}
