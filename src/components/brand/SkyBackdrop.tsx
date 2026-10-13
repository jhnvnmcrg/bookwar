import { Rng } from "#/game/rng";

// Seeded so the server and browser draw the same stars.
const rng = Rng.fromSeed("night-sky");
const STARS = Array.from({ length: 110 }, () => ({
	x: rng.next() * 100,
	y: rng.next() * 100,
	r: 0.08 + rng.next() * 0.16,
	opacity: 0.2 + rng.next() * 0.6,
}));

/** Fixed night sky behind every page. */
export function SkyBackdrop() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-0 -z-10"
			style={{
				background:
					"radial-gradient(120% 70% at 50% -10%, #23306b 0%, var(--lapis) 45%, var(--lapis-deep) 100%)",
			}}
		>
			<svg
				aria-hidden="true"
				className="absolute inset-0 h-full w-full"
				viewBox="0 0 100 100"
				preserveAspectRatio="xMidYMid slice"
			>
				{STARS.map((star) => (
					<circle
						key={`${star.x}-${star.y}`}
						cx={star.x}
						cy={star.y}
						r={star.r}
						fill="#f4ead2"
						opacity={star.opacity}
					/>
				))}
			</svg>
		</div>
	);
}
