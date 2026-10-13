// Who this browser is in multiplayer: a private guest id (kept secret, it reclaims your seat
// after a reconnect) and the wizard name other players see.
import { z } from "zod";

const KEY = "bookwar:v1:profile";

const ProfileSchema = z.object({
	guestId: z.string().min(16).max(64),
	nickname: z.string().max(40),
});

export type Profile = z.infer<typeof ProfileSchema>;

function read(): Profile | null {
	try {
		const text = window.localStorage.getItem(KEY);
		if (!text) return null;
		const parsed = ProfileSchema.safeParse(JSON.parse(text));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

function write(profile: Profile): void {
	try {
		window.localStorage.setItem(KEY, JSON.stringify(profile));
	} catch {
		// Without storage the profile only lasts for this page.
	}
}

/** This browser's profile, created on first use. */
export function loadProfile(): Profile {
	const existing = read();
	if (existing) return existing;
	const profile = { guestId: crypto.randomUUID(), nickname: "" };
	write(profile);
	return profile;
}

export function saveNickname(nickname: string): Profile {
	const profile = { ...loadProfile(), nickname };
	write(profile);
	return profile;
}
