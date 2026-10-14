import { Volume2, VolumeX } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "#/components/ui/button";
import { isMuted, setMuted, subscribeMuted } from "#/lib/sound";

/** Sound on or off, remembered in this browser. */
export function SoundToggle() {
	const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label="Sound"
			aria-pressed={!muted}
			title={muted ? "Turn sound on" : "Turn sound off"}
			className="text-vellum-dim hover:text-vellum"
			onClick={() => setMuted(!muted)}
		>
			{muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
		</Button>
	);
}
