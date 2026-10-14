// Neon Auth in the browser: sign up, sign in and out, and the login token Bookwar's server
// checks. The browser talks to Neon Auth directly; our server never sees passwords.
import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL;

/** False when no auth URL is configured: everyone plays as a guest. */
export const accountsEnabled = Boolean(AUTH_URL);

const create = () =>
	createAuthClient(AUTH_URL ?? "", { adapter: BetterAuthReactAdapter() });

let client: ReturnType<typeof create> | null = null;

/** The auth client, created on first use (in the browser). */
export function authClient() {
	client ??= create();
	return client;
}

/**
 * The signed-in player's login token (a JWT that lasts 15 minutes), or null for guests. The
 * client caches the session and fetches a fresh token before the old one runs out.
 */
export async function accessToken(): Promise<string | null> {
	if (!accountsEnabled || typeof window === "undefined") return null;
	try {
		const { data } = await authClient().getSession();
		return data?.session?.token ?? null;
	} catch {
		return null;
	}
}
