// Checks the login tokens Neon Auth gives signed-in players: EdDSA-signed JWTs whose keys are
// published at the auth URL's JWKS endpoint. Used by server functions and the game server.
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";

export interface SignedInUser {
	/** The Neon Auth user id (a UUID). */
	readonly userId: string;
	readonly name: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Verifier {
	readonly baseUrl: string;
	readonly origin: string;
	readonly keys: JWTVerifyGetKey;
}

// The key set caches fetched keys; keep one per process (both server bundles share it).
const shared = globalThis as typeof globalThis & { __bookwarJwks?: Verifier };

function verifier(): Verifier | null {
	const baseUrl =
		process.env.NEON_AUTH_BASE_URL ?? process.env.VITE_NEON_AUTH_URL;
	if (!baseUrl) return null;
	if (shared.__bookwarJwks?.baseUrl !== baseUrl) {
		shared.__bookwarJwks = {
			baseUrl,
			origin: new URL(baseUrl).origin,
			keys: createRemoteJWKSet(new URL(`${baseUrl}/.well-known/jwks.json`)),
		};
	}
	return shared.__bookwarJwks;
}

/** The player a token belongs to, or null when it's missing, expired, forged or banned. */
export async function verifyAccessToken(
	token: string,
): Promise<SignedInUser | null> {
	const v = verifier();
	if (!v || !token) return null;
	try {
		const { payload } = await jwtVerify(token, v.keys, {
			// Neon Auth issues tokens with the auth URL's origin as issuer and audience.
			issuer: v.origin,
			audience: v.origin,
			algorithms: ["EdDSA"],
		});
		if (typeof payload.sub !== "string" || !UUID.test(payload.sub)) return null;
		if (payload.banned === true) return null;
		return {
			userId: payload.sub.toLowerCase(),
			name: typeof payload.name === "string" ? payload.name : null,
		};
	} catch {
		return null;
	}
}

/** The token from an `Authorization: Bearer …` header. */
export function bearerToken(header: string | null | undefined): string | null {
	const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
	return match ? match[1] : null;
}
