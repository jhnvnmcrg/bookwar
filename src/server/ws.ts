// WebSocket endpoint for live games (registered at /api/ws in vite.config.ts).
import { defineWebSocketHandler } from "nitro";
import { gameHub } from "./realtime/registry";

/**
 * The client's network address, for the per-address connection cap. Behind a proxy (most
 * hosts), set TRUST_PROXY=1 so the address comes from the X-Forwarded-For header instead of
 * the proxy itself.
 */
function clientAddress(peer: {
	remoteAddress?: string;
	request: Request;
}): string {
	if (process.env.TRUST_PROXY === "1") {
		const forwarded = peer.request.headers.get("x-forwarded-for");
		const first = forwarded?.split(",")[0]?.trim();
		if (first) return first;
	}
	return peer.remoteAddress ?? "unknown";
}

export default defineWebSocketHandler({
	open(peer) {
		const accepted = gameHub().connect(
			peer.id,
			(message) => peer.send(JSON.stringify(message)),
			clientAddress(peer),
		);
		// Too many sockets: the client has been told why; try again later.
		if (!accepted) peer.close(1013, "Try again later");
	},
	message(peer, message) {
		void gameHub().receive(peer.id, message.text());
	},
	close(peer) {
		gameHub().disconnect(peer.id);
	},
	error(peer) {
		gameHub().disconnect(peer.id);
	},
});
