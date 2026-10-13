import type { Board } from "#/game";
import {
	BOARD_HEIGHT,
	BOARD_WIDTH,
	cellCenter,
	hexPoints,
	STONE_RADIUS,
} from "../game/hex-geometry";

const HEX = hexPoints(STONE_RADIUS);
const FILL = {
	rune: "var(--stone)",
	curse: "#5b2f78",
	1: "#2f8a60",
	2: "#2f56b0",
	3: "#9c2c45",
	4: "#bcd8e3",
} as const;

/** A small, static picture of an opponent's board. */
export function MiniBoard({ board, label }: { board: Board; label: string }) {
	return (
		<svg
			viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
			role="img"
			aria-label={label}
			className="block w-full"
		>
			<rect
				x={4}
				y={4}
				width={BOARD_WIDTH - 8}
				height={BOARD_HEIGHT - 8}
				rx={16}
				style={{ fill: "var(--lapis-deep)", stroke: "var(--gold)" }}
				strokeOpacity={0.5}
				strokeWidth={4}
			/>
			{board.map((stone, index) => {
				if (!stone) return null;
				const { x, y } = cellCenter(index);
				const fill =
					stone.kind === "crystal" ? FILL[stone.tier] : FILL[stone.kind];
				return (
					<g key={stone.id} transform={`translate(${x} ${y})`}>
						<polygon
							points={HEX}
							style={{ fill }}
							stroke={stone.kind === "curse" ? "#c49be8" : "none"}
							strokeWidth={6}
						/>
						<text
							className={`font-stone ${stone.kind === "crystal" && stone.tier === 4 ? "fill-lapis-deep" : "fill-vellum"}`}
							textAnchor="middle"
							dominantBaseline="central"
							fontSize={38}
							fontWeight={700}
							opacity={0.8}
						>
							{stone.letter === "qu" ? "Qu" : stone.letter.toUpperCase()}
						</text>
					</g>
				);
			})}
		</svg>
	);
}
