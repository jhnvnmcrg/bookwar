import { type PointerEvent, useId, useRef } from "react";
import {
	type Board,
	type Stone as BoardStone,
	COLS,
	colOf,
	ROWS,
	rowOf,
	toIndex,
} from "#/game";
import type { Glow } from "#/hooks/useMoveFeedback";
import { gsap, prefersReducedMotion, useGSAP } from "#/lib/gsap";
import {
	BOARD_HEIGHT,
	BOARD_WIDTH,
	cellAt,
	cellCenter,
	HEX_HEIGHT,
	type Point,
	threadLink,
} from "./hex-geometry";
import { Stone, StoneDefs } from "./Stone";

export interface HexBoardProps {
	readonly board: Board;
	readonly selection: readonly number[];
	/** Stones being cast right now; the board bursts them, then calls onCastAnimated. */
	readonly casting: readonly number[] | null;
	/** Bumped to shake the selection after a rejected word. */
	readonly rejectKey: number;
	/** Bumped after a shuffle so the stones visibly re-roll. */
	readonly shuffleKey: number;
	readonly locked: boolean;
	/** Which edge of the board is the losing line. */
	readonly dangerEdge: "bottom" | "top";
	/** New crystals to make shine as they land. */
	readonly glow?: Glow;
	/** The tower has fallen: the stones tumble off the board. */
	readonly fallen?: boolean;
	readonly onPress: (index: number) => void;
	readonly onDrag: (index: number) => void;
	readonly onRelease: () => void;
	readonly onCancel: () => void;
	readonly onCastAnimated: () => void;
}

const FRAME_INSET = 6;

const CRYSTAL_NAMES = ["", "emerald", "sapphire", "ruby", "diamond"];

function spokenStone(stone: BoardStone, row: number): string {
	const letter = stone.letter === "qu" ? "Qu" : stone.letter.toUpperCase();
	if (stone.kind === "curse") {
		const above = ROWS - 1 - row;
		return `curse ${letter} (${above === 0 ? "on the bottom row" : `${above} ${above === 1 ? "row" : "rows"} above the bottom`})`;
	}
	if (stone.kind === "crystal")
		return `${letter} (${CRYSTAL_NAMES[stone.tier]} crystal)`;
	return letter;
}

/** The board as text for screen readers: each column's stones from top to bottom. */
function BoardText({ board }: { board: Board }) {
	return (
		<div className="sr-only">
			<p>Stones on the board, column by column, top to bottom:</p>
			<ul>
				{Array.from({ length: COLS }, (_, col) => {
					const stones = Array.from({ length: ROWS }, (_, row) => {
						const stone = board[toIndex(col, row)];
						return stone ? spokenStone(stone, row) : null;
					}).filter((text) => text !== null);
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: columns are fixed positions
						<li key={col}>
							Column {col + 1}: {stones.length ? stones.join(", ") : "empty"}.
						</li>
					);
				})}
			</ul>
		</div>
	);
}

/** Links between consecutive selected stones, drawn in the gaps between them. */
function threadLinks(selection: readonly number[]) {
	return selection.slice(1).map((index, i) => ({
		key: `${selection[i]}-${index}`,
		...threadLink(cellCenter(selection[i]), cellCenter(index)),
	}));
}

export function HexBoard({
	board,
	selection,
	casting,
	rejectKey,
	shuffleKey,
	locked,
	dangerEdge,
	glow,
	fallen = false,
	onPress,
	onDrag,
	onRelease,
	onCancel,
	onCastAnimated,
}: HexBoardProps) {
	const prefix = `b${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
	const svgRef = useRef<SVGSVGElement>(null);
	/** Where each stone id was last placed, so moves can be animated from there. */
	const placed = useRef(new Map<number, number>());
	const dragging = useRef(false);

	const stones = board.flatMap((stone, index) =>
		stone ? [{ stone, index }] : [],
	);
	const selected = new Set(selection);
	const links = casting ? [] : threadLinks(selection);

	const stoneElement = (id: number | undefined) =>
		id === undefined
			? null
			: (svgRef.current?.querySelector<SVGGElement>(`[data-stone="${id}"]`) ??
				null);
	const burstElements = (indexes: readonly number[]) =>
		indexes.flatMap((index) => {
			const element = stoneElement(board[index]?.id)?.querySelector(
				".stone-burst",
			);
			return element ? [element] : [];
		});

	// Place stones: new ones drop in from above their column, moved ones fall (or a
	// sinking curse swaps down) to their new cell.
	useGSAP(
		() => {
			const reduce = prefersReducedMotion();
			const newInColumn = new Map<number, number>();
			for (const { stone, index } of stones) {
				if (!placed.current.has(stone.id)) {
					newInColumn.set(
						colOf(index),
						(newInColumn.get(colOf(index)) ?? 0) + 1,
					);
				}
			}
			const next = new Map<number, number>();
			for (const { stone, index } of stones) {
				next.set(stone.id, index);
				const element = stoneElement(stone.id);
				if (!element) continue;
				const { x, y } = cellCenter(index);
				const before = placed.current.get(stone.id);
				if (before === undefined) {
					const drop =
						((newInColumn.get(colOf(index)) ?? 1) + 0.6) * HEX_HEIGHT;
					if (reduce) gsap.set(element, { x, y, opacity: 1 });
					else
						gsap.fromTo(
							element,
							{ x, y: y - drop, opacity: 0 },
							{
								y,
								opacity: 1,
								duration: 0.42,
								ease: "power2.in",
								delay: colOf(index) * 0.025 + (ROWS - rowOf(index)) * 0.01,
							},
						);
				} else if (before !== index) {
					if (reduce) gsap.set(element, { x, y });
					else gsap.to(element, { x, y, duration: 0.34, ease: "power2.in" });
				}
			}
			placed.current = next;
			// Reverting (unmount, or React's dev double-mount) undoes the placement, so the
			// next run must treat every stone as new.
			return () => {
				placed.current = new Map();
			};
		},
		{ dependencies: [board], scope: svgRef },
	);

	// Cast: the chosen stones swell and burst in the order they were spelled.
	useGSAP(
		() => {
			if (!casting) {
				// A cast the server turned down leaves burst stones on the board: bring them back.
				const all = svgRef.current?.querySelectorAll(".stone-burst");
				if (all?.length) gsap.set(all, { clearProps: "transform,opacity" });
				return;
			}
			const elements = burstElements(casting);
			if (prefersReducedMotion() || elements.length === 0) {
				onCastAnimated();
				return;
			}
			gsap
				.timeline({ onComplete: onCastAnimated })
				.to(elements, {
					scale: 1.18,
					duration: 0.12,
					stagger: 0.035,
					ease: "power1.out",
					transformOrigin: "50% 50%",
				})
				.to(
					elements,
					{
						scale: 0.2,
						opacity: 0,
						duration: 0.2,
						stagger: 0.035,
						ease: "power2.in",
					},
					"-=0.05",
				);
		},
		{ dependencies: [casting], scope: svgRef },
	);

	// Rejected word: the selected stones shake.
	useGSAP(
		() => {
			if (rejectKey === 0 || prefersReducedMotion()) return;
			const elements = burstElements(selection);
			if (elements.length === 0) return;
			gsap.fromTo(
				elements,
				{ x: -7 },
				{ x: 0, duration: 0.45, ease: "elastic.out(1, 0.3)" },
			);
		},
		{ dependencies: [rejectKey], scope: svgRef },
	);

	// Shuffle: every stone re-rolls in a quick ripple.
	useGSAP(
		() => {
			if (shuffleKey === 0 || prefersReducedMotion()) return;
			const elements = svgRef.current?.querySelectorAll(".stone-burst");
			if (!elements) return;
			gsap.fromTo(
				elements,
				{ scale: 0.7, opacity: 0.3, transformOrigin: "50% 50%" },
				{
					scale: 1,
					opacity: 1,
					duration: 0.32,
					ease: "back.out(2)",
					stagger: { each: 0.006, from: "random" },
				},
			);
		},
		{ dependencies: [shuffleKey], scope: svgRef },
	);

	// New crystals swell and settle as they land.
	useGSAP(
		() => {
			if (!glow?.key || prefersReducedMotion()) return;
			const elements = glow.ids.flatMap((id) => {
				const element = stoneElement(id)?.querySelector(".stone-burst");
				return element ? [element] : [];
			});
			if (elements.length === 0) return;
			gsap.fromTo(
				elements,
				{ scale: 1.5, transformOrigin: "50% 50%" },
				{ scale: 1, duration: 0.8, delay: 0.38, ease: "elastic.out(1, 0.4)" },
			);
		},
		{ dependencies: [glow?.key], scope: svgRef },
	);

	// The tower falls: the board shudders and every stone tumbles away.
	useGSAP(
		() => {
			if (!fallen || prefersReducedMotion() || !svgRef.current) return;
			const all = svgRef.current.querySelectorAll("[data-stone]");
			gsap
				.timeline()
				.fromTo(
					svgRef.current,
					{ x: -8 },
					{ x: 0, duration: 0.5, ease: "elastic.out(1, 0.2)" },
				)
				.to(
					all,
					{
						y: `+=${BOARD_HEIGHT}`,
						rotation: () => gsap.utils.random(-70, 70),
						transformOrigin: "50% 50%",
						opacity: 0,
						duration: 0.8,
						ease: "power2.in",
						// Done by ~1.35 s, just before the results appear (solo.$mode.tsx).
						stagger: { each: 0.006, from: "random" },
					},
					0.2,
				);
		},
		{ dependencies: [fallen], scope: svgRef },
	);

	function toBoardPoint(event: PointerEvent<SVGSVGElement>): Point | null {
		const matrix = svgRef.current?.getScreenCTM();
		if (!matrix) return null;
		const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
			matrix.inverse(),
		);
		return { x: point.x, y: point.y };
	}

	function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
		if (locked || event.button > 0) return;
		const point = toBoardPoint(event);
		const index = point ? cellAt(point, 0.95) : null;
		if (index === null) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		dragging.current = true;
		onPress(index);
	}

	function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
		if (!dragging.current) return;
		const point = toBoardPoint(event);
		const index = point ? cellAt(point) : null;
		if (index !== null) onDrag(index);
	}

	function handlePointerUp() {
		if (!dragging.current) return;
		dragging.current = false;
		onRelease();
	}

	function handlePointerCancel() {
		dragging.current = false;
		onCancel();
	}

	return (
		<>
			{/* biome-ignore lint/a11y/useSemanticElements: an SVG can't be a <fieldset>; "group" names the board */}
			<svg
				ref={svgRef}
				viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
				className="block h-auto w-full touch-none select-none"
				role="group"
				aria-label="Rune board. Tap or drag across touching stones, or type a word."
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerCancel}
			>
				<defs>
					<StoneDefs prefix={prefix} />
					<linearGradient id={`${prefix}-page`} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" style={{ stopColor: "var(--lapis-raised)" }} />
						<stop offset="100%" style={{ stopColor: "var(--lapis-deep)" }} />
					</linearGradient>
					<linearGradient
						id={`${prefix}-danger`}
						x1="0"
						y1={dangerEdge === "bottom" ? 0 : 1}
						x2="0"
						y2={dangerEdge === "bottom" ? 1 : 0}
					>
						<stop
							offset="0%"
							style={{ stopColor: "var(--rubric)", stopOpacity: 0 }}
						/>
						<stop
							offset="100%"
							style={{ stopColor: "var(--rubric)", stopOpacity: 0.32 }}
						/>
					</linearGradient>
					<clipPath id={`${prefix}-clip`}>
						<rect
							x={FRAME_INSET}
							y={FRAME_INSET}
							width={BOARD_WIDTH - 2 * FRAME_INSET}
							height={BOARD_HEIGHT - 2 * FRAME_INSET}
							rx={14}
						/>
					</clipPath>
				</defs>

				{/* The page: lapis ground in a gilded double frame. */}
				<rect
					x={FRAME_INSET}
					y={FRAME_INSET}
					width={BOARD_WIDTH - 2 * FRAME_INSET}
					height={BOARD_HEIGHT - 2 * FRAME_INSET}
					rx={14}
					fill={`url(#${prefix}-page)`}
				/>
				{/* The danger edge glows red: in Classic a curse that sinks to the bottom topples the
			    tower; in Action, stones piling up to the top bury it. */}
				<rect
					x={FRAME_INSET}
					y={
						dangerEdge === "bottom"
							? BOARD_HEIGHT - FRAME_INSET - HEX_HEIGHT * 1.6
							: FRAME_INSET
					}
					width={BOARD_WIDTH - 2 * FRAME_INSET}
					height={HEX_HEIGHT * 1.6}
					fill={`url(#${prefix}-danger)`}
					clipPath={`url(#${prefix}-clip)`}
				/>

				<g clipPath={`url(#${prefix}-clip)`}>
					{stones.map(({ stone, index }) => (
						<g key={stone.id} data-stone={stone.id} style={{ opacity: 0 }}>
							<g className="stone-burst">
								<Stone
									prefix={prefix}
									letter={stone.letter}
									kind={stone.kind}
									tier={stone.kind === "crystal" ? stone.tier : undefined}
									selected={selected.has(index)}
									rowsToBottom={
										stone.kind === "curse" ? ROWS - 1 - rowOf(index) : undefined
									}
								/>
							</g>
						</g>
					))}
				</g>

				<g
					pointerEvents="none"
					style={{ stroke: "var(--verdigris)" }}
					strokeWidth={7}
					strokeLinecap="round"
				>
					{links.map((link) => (
						<line
							key={link.key}
							x1={link.x1}
							y1={link.y1}
							x2={link.x2}
							y2={link.y2}
						/>
					))}
				</g>

				<rect
					x={FRAME_INSET}
					y={FRAME_INSET}
					width={BOARD_WIDTH - 2 * FRAME_INSET}
					height={BOARD_HEIGHT - 2 * FRAME_INSET}
					rx={14}
					fill="none"
					style={{ stroke: "var(--gold)" }}
					strokeWidth={3}
					pointerEvents="none"
				/>
				<rect
					x={1}
					y={1}
					width={BOARD_WIDTH - 2}
					height={BOARD_HEIGHT - 2}
					rx={18}
					fill="none"
					style={{ stroke: "var(--gold)" }}
					strokeOpacity={0.45}
					strokeWidth={1.5}
					pointerEvents="none"
				/>
			</svg>
			<BoardText board={board} />
		</>
	);
}
