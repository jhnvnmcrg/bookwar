// GSAP with the React hook registered once for the whole app.
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };

export function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}
