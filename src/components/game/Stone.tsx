import { type CrystalTier, crystalSpec, type Letter } from "#/game";
import { hexPoints, STONE_RADIUS } from "./hex-geometry";

const OUTER = hexPoints(STONE_RADIUS);
const BEVEL = hexPoints(STONE_RADIUS - 6);
const RING = hexPoints(STONE_RADIUS + 1.5);

const CRYSTAL_FILL: Record<CrystalTier, string> = {
	1: "emerald",
	2: "sapphire",
	3: "ruby",
	4: "diamond",
};

const GRADIENTS: Record<string, readonly [string, string, string?]> = {
	rune: ["var(--stone-light)", "var(--stone)"],
	curse: ["#47295c", "var(--curse)"],
	emerald: ["#5cc999", "#1f6b4c"],
	sapphire: ["#6f9af0", "#22409a"],
	ruby: ["#e2607a", "#7d1d33"],
	diamond: ["#ffffff", "var(--diamond)", "#8fb8c9"],
};

/** Gradients and glow shared by every stone in one SVG. Ids are prefixed so SVGs don't clash. */
export function StoneDefs({ prefix }: { prefix: string }) {
	return (
		<>
			{Object.entries(GRADIENTS).map(([name, colors]) => (
				<linearGradient
					key={name}
					id={`${prefix}-${name}`}
					x1="0"
					y1="0"
					x2="0.2"
					y2="1"
				>
					{colors.map((color, i) => (
						<stop
							key={color}
							offset={`${(i / (colors.length - 1)) * 100}%`}
							style={{ stopColor: color }}
						/>
					))}
				</linearGradient>
			))}
			<filter
				id={`${prefix}-glow`}
				x="-30%"
				y="-30%"
				width="160%"
				height="160%"
			>
				<feGaussianBlur stdDeviation="4" result="blur" />
				<feMerge>
					<feMergeNode in="blur" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
		</>
	);
}

export interface StoneProps {
	readonly prefix: string;
	readonly letter: Letter;
	readonly kind: "rune" | "curse" | "crystal";
	readonly tier?: CrystalTier;
	readonly selected?: boolean;
	/** For curses: rows left between this stone and the bottom. */
	readonly rowsToBottom?: number;
}

/** One rune stone drawn around 0,0. Position and burst animations live on a parent <g>. */
export function Stone({
	prefix,
	letter,
	kind,
	tier,
	selected = false,
	rowsToBottom,
}: StoneProps) {
	const fill =
		kind === "crystal" && tier
			? CRYSTAL_FILL[tier]
			: kind === "curse"
				? "curse"
				: "rune";
	const ink =
		kind === "crystal" && tier === 4 ? "fill-lapis-deep" : "fill-vellum";
	const danger = rowsToBottom !== undefined && rowsToBottom <= 2;

	return (
		<g className="stone-body" data-selected={selected}>
			{kind === "curse" && (
				<polygon
					className="curse-pulse"
					points={RING}
					fill="none"
					style={{ stroke: "var(--curse-glow)" }}
					strokeWidth={6}
					filter={`url(#${prefix}-glow)`}
				/>
			)}
			<polygon
				points={OUTER}
				fill={`url(#${prefix}-${fill})`}
				stroke={kind === "curse" ? "#8c5bc0" : "rgb(0 0 0 / 0.35)"}
				strokeWidth={2}
			/>
			<polygon
				points={BEVEL}
				fill="none"
				stroke="rgb(255 255 255 / 0.09)"
				strokeWidth={2}
			/>

			{kind === "curse" && (
				<path
					d="M -10 -36 L -2 -20 L -9 -6 M -2 -20 L 12 -26 M 16 10 L 6 22 L 12 36 M 6 22 L -8 26"
					fill="none"
					stroke="#c49be8"
					strokeOpacity={0.55}
					strokeWidth={2}
					strokeLinecap="round"
				/>
			)}
			{kind === "crystal" && (
				<polygon
					points="0,-37 9,-29 0,-21 -9,-29"
					fill="rgb(255 255 255 / 0.8)"
					stroke="rgb(0 0 0 / 0.25)"
					strokeWidth={1}
				/>
			)}

			<text
				className={`font-stone ${ink}`}
				x={0}
				y={kind === "crystal" ? 2 : 0}
				textAnchor="middle"
				dominantBaseline="central"
				fontWeight={700}
				fontSize={36}
			>
				{letter === "qu" ? (
					<>
						Q<tspan fontSize={24}>u</tspan>
					</>
				) : (
					letter.toUpperCase()
				)}
			</text>

			{kind === "crystal" && tier && (
				<text
					className={`font-sans ${ink}`}
					x={0}
					y={29}
					textAnchor="middle"
					dominantBaseline="central"
					fontWeight={700}
					fontSize={13}
				>
					×{crystalSpec(tier).multiplier}
				</text>
			)}
			{kind === "curse" && rowsToBottom !== undefined && (
				<g transform="translate(25 22)">
					<circle
						r={10}
						style={{ fill: danger ? "var(--rubric)" : "#5b3a78" }}
					/>
					<text
						className="fill-vellum font-sans"
						textAnchor="middle"
						dominantBaseline="central"
						fontWeight={700}
						fontSize={13}
					>
						{rowsToBottom}
					</text>
				</g>
			)}

			{selected && (
				<polygon
					points={RING}
					fill="none"
					style={{ stroke: "var(--verdigris)" }}
					strokeWidth={4}
					filter={`url(#${prefix}-glow)`}
				/>
			)}
		</g>
	);
}
