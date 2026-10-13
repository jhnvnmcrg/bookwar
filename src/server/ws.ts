// WebSocket endpoint for live games (registered at /api/ws in vite.config.ts).
import { defineWebSocketHandler } from "nitro";
import { gameHub } from "./realtime/registry";

export default defineWebSocketHandler({
	open(peer) {
		gameHub().connect(peer.id, (message) => peer.send(JSON.stringify(message)));
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
