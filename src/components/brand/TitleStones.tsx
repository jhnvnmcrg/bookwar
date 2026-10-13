import { useId, useRef } from "react";
import {
	HEX_HEIGHT,
	HEX_SIZE,
	threadLink,
} from "#/components/game/hex-geometry";
import { Stone, StoneDefs } from "#/components/game/Stone";
import type { Letter } from "#/game";
import { gsap, prefersReducedMotion, useGSAP } from "#/lib/gsap";

const LETTERS: Letter[] = ["b", "o", "o", "k", "w", "a", "r"];
const PAD = 14;
const WIDTH = 2 * PAD + HEX_SIZE * (1.5 * (LETTERS.length - 1) + 2);
const HEIGHT = 2 * PAD + HEX_HEIGHT * 1.5;
// Same zigzag as the board: odd columns half a stone lower, so BOOKWAR is a real path.
const CENTERS = LETTERS.map((_, col) => ({
	x: PAD + HEX_SIZE + col * 1.5 * HEX_SIZE,
	y: PAD + HEX_HEIGHT / 2 + (col % 2 === 1 ? HEX_HEIGHT / 2 : 0),
}));
const LINKS = CENTERS.slice(1).map((to, i) => threadLink(CENTERS[i], to));

/**
 * The logo: BOOKWAR spelled across seven rune stones. On load the stones drop in and a
 * spell thread traces through them; with reduced motion it simply appears.
 */
export function TitleStones() {
	const prefix = `t${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
	const scope = useRef<SVGSVGElement>(null);

	useGSAP(
		() => {
			const stones = gsap.utils.toArray<SVGGElement>(".title-stone");
			const links = gsap.utils.toArray<SVGLineElement>(".title-link");
			if (prefersReducedMotion()) {
				gsap.set(stones, { opacity: 1 });
				gsap.set(links, { strokeDashoffset: 0 });
				return;
			}
			gsap
				.timeline({ delay: 0.15 })
				.fromTo(
					stones,
					{ y: -40, opacity: 0 },
					{
						y: 0,
						opacity: 1,
						duration: 0.55,
						ease: "power3.out",
						stagger: 0.08,
					},
				)
				.to(
					links,
					{ strokeDashoffset: 0, duration: 0.14, stagger: 0.12, ease: "none" },
					"-=0.2",
				);
		},
		{ scope },
	);

	return (
		<svg
			ref={scope}
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			className="mx-auto block w-full max-w-xl"
			aria-hidden="true"
		>
			<defs>
				<StoneDefs prefix={prefix} />
			</defs>
			{LETTERS.map((letter, col) => (
				<g
					key={`${letter}-${CENTERS[col].x}`}
					transform={`translate(${CENTERS[col].x} ${CENTERS[col].y})`}
				>
					<g className="title-stone" style={{ opacity: 0 }}>
						<Stone prefix={prefix} letter={letter} kind="rune" selected />
					</g>
				</g>
			))}
			<g
				style={{ stroke: "var(--verdigris)" }}
				strokeWidth={7}
				strokeLinecap="round"
			>
				{LINKS.map((link) => (
					<line
						key={`${link.x1}-${link.y1}`}
						className="title-link"
						{...link}
						pathLength={1}
						strokeDasharray={1}
						strokeDashoffset={1}
					/>
				))}
			</g>
		</svg>
	);
}
