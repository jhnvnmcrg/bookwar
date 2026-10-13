export type NoxMood = "idle" | "happy" | "wow" | "worried" | "sad";

/** Nox, the owl familiar who comments on your spells. */
export function Nox({
	mood = "idle",
	className,
}: {
	mood?: NoxMood;
	className?: string;
}) {
	const pupil = mood === "wow" ? 9 : 7;
	return (
		<svg viewBox="0 0 120 140" className={className} aria-hidden="true">
			{/* ear tufts */}
			<path d="M24 34 L18 6 L44 24 Z" fill="#6b5640" />
			<path d="M96 34 L102 6 L76 24 Z" fill="#6b5640" />
			{/* body */}
			<path
				d="M60 18 C 92 18 106 44 106 76 C 106 110 86 132 60 132 C 34 132 14 110 14 76 C 14 44 28 18 60 18 Z"
				fill="#8a7356"
			/>
			{/* belly */}
			<path
				d="M60 66 C 82 66 90 88 88 106 C 86 122 74 130 60 130 C 46 130 34 122 32 106 C 30 88 38 66 60 66 Z"
				fill="#d7c39b"
			/>
			<path
				d="M46 92 q4 4 8 0 M58 100 q4 4 8 0 M70 92 q4 4 8 0 M52 112 q4 4 8 0 M64 112 q4 4 8 0"
				fill="none"
				stroke="#a8916a"
				strokeWidth={2}
				strokeLinecap="round"
			/>
			{/* wings */}
			<path
				d="M16 72 C 10 96 18 118 34 126 C 26 108 26 88 30 70 Z"
				fill="#6b5640"
			/>
			<path
				d="M104 72 C 110 96 102 118 86 126 C 94 108 94 88 90 70 Z"
				fill="#6b5640"
			/>
			{/* face disc */}
			<ellipse cx={42} cy={54} rx={20} ry={19} fill="#c7b089" />
			<ellipse cx={78} cy={54} rx={20} ry={19} fill="#c7b089" />

			{mood === "happy" ? (
				<g fill="none" stroke="#2b1f14" strokeWidth={4} strokeLinecap="round">
					<path d="M32 56 q10 -10 20 0" />
					<path d="M68 56 q10 -10 20 0" />
				</g>
			) : (
				<g>
					<circle cx={42} cy={54} r={14} fill="#f6efdc" />
					<circle cx={78} cy={54} r={14} fill="#f6efdc" />
					<circle
						cx={42}
						cy={55}
						r={10}
						style={{ fill: "var(--gold-bright)" }}
					/>
					<circle
						cx={78}
						cy={55}
						r={10}
						style={{ fill: "var(--gold-bright)" }}
					/>
					<circle cx={42} cy={56} r={pupil} fill="#1a130c" />
					<circle cx={78} cy={56} r={pupil} fill="#1a130c" />
					<circle cx={45} cy={51} r={2.5} fill="#fff" />
					<circle cx={81} cy={51} r={2.5} fill="#fff" />
					{mood === "sad" && (
						<g fill="#8a7356">
							<rect x={27} y={39} width={30} height={13} rx={4} />
							<rect x={63} y={39} width={30} height={13} rx={4} />
						</g>
					)}
					{/* eyelids for blinking */}
					<g className="owl-blink" fill="#8a7356">
						<ellipse cx={42} cy={54} rx={15} ry={15} />
						<ellipse cx={78} cy={54} rx={15} ry={15} />
					</g>
				</g>
			)}

			{/* brows */}
			{mood === "worried" && (
				<g stroke="#3b2c1c" strokeWidth={4} strokeLinecap="round">
					<path d="M30 36 L52 42" />
					<path d="M90 36 L68 42" />
				</g>
			)}
			{mood === "wow" && (
				<g fill="none" stroke="#3b2c1c" strokeWidth={4} strokeLinecap="round">
					<path d="M30 34 q12 -8 24 0" />
					<path d="M66 34 q12 -8 24 0" />
				</g>
			)}
			{/* beak */}
			<path d="M54 66 L66 66 L60 80 Z" style={{ fill: "var(--gold)" }} />
		</svg>
	);
}
