import type { Banner } from "#/hooks/useSoloGame";

/** Brief ribbon over the board when the player rises a rank. */
export function LevelBanner({ banner }: { banner: Banner | null }) {
	if (!banner) return null;
	return (
		<div
			key={banner.id}
			className="banner-in pointer-events-none absolute inset-x-6 top-1/3 z-10 rounded-md bg-gold px-4 py-3 text-center text-lapis-deep shadow-[0_10px_30px_rgb(0_0_0/0.45)]"
		>
			<p className="font-stone text-3xl font-bold">{banner.title}</p>
			<p className="text-sm">{banner.detail}</p>
		</div>
	);
}
