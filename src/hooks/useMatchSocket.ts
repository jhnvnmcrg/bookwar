import { useEffect, useEffectEvent, useRef, useState } from "react";
import { accessToken } from "#/lib/auth-client";
import type { Profile } from "#/lib/profile";
import {
	type ClientMessage,
	PROTOCOL_VERSION,
	type ServerMessage,
	WS_PATH,
} from "#/shared/protocol";

export type SocketStatus = "connecting" | "open" | "reconnecting";

const PING_MS = 5000;
const MAX_BACKOFF_MS = 5000;
const TRY_AGAIN_LATER = 1013;
const BUSY_RETRY_MS = 30_000;

/**
 * Development only: lets browser tests send raw messages through the page's own connection
 * (e.g. a tampered move) and read what the server sent back.
 */
interface DevHook {
	send: (message: Record<string, unknown>) => void;
	received: ServerMessage[];
}
declare global {
	interface Window {
		__bookwarDev?: DevHook;
	}
}
function devHook(): DevHook {
	window.__bookwarDev ??= { send: () => {}, received: [] };
	return window.__bookwarDev;
}

/**
 * The game-server connection: says hello with the player's profile (and login token, when
 * signed in, so finished matches are kept), reconnects with backoff when the connection
 * drops, and keeps an estimate of the server's clock for match timers.
 */
export function useMatchSocket(
	profile: Profile,
	onMessage: (message: ServerMessage) => void,
) {
	const [status, setStatus] = useState<SocketStatus>("connecting");
	const socketRef = useRef<WebSocket | null>(null);
	/** serverTime ≈ Date.now() + offset; taken from the fastest recent ping. */
	const clock = useRef({ offset: 0, bestRtt: Number.POSITIVE_INFINITY });

	const handle = useEffectEvent((message: ServerMessage) => {
		if (import.meta.env.DEV) devHook().received.push(message);
		if (message.type === "pong") {
			const now = Date.now();
			const rtt = now - message.t;
			// Prefer fast round trips; let old samples age out slowly.
			if (rtt <= clock.current.bestRtt * 1.5) {
				clock.current = {
					offset: message.serverNow + rtt / 2 - now,
					bestRtt: Math.min(rtt, clock.current.bestRtt),
				};
			}
			clock.current.bestRtt *= 1.05;
			return;
		}
		if (
			message.type === "welcome" &&
			clock.current.bestRtt === Number.POSITIVE_INFINITY
		) {
			clock.current.offset = message.serverNow - Date.now();
		}
		onMessage(message);
	});

	const hello = useEffectEvent(
		(token: string | null): ClientMessage => ({
			type: "hello",
			v: PROTOCOL_VERSION,
			guestId: profile.guestId,
			nickname: profile.nickname,
			...(token ? { token } : {}),
		}),
	);

	useEffect(() => {
		let stopped = false;
		let attempt = 0;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		let pingTimer: ReturnType<typeof setInterval> | undefined;
		const quickPings: ReturnType<typeof setTimeout>[] = [];
		const stopPings = () => {
			clearInterval(pingTimer);
			for (const timer of quickPings.splice(0)) clearTimeout(timer);
		};

		const connect = () => {
			const scheme = window.location.protocol === "https:" ? "wss" : "ws";
			const socket = new WebSocket(
				`${scheme}://${window.location.host}${WS_PATH}`,
			);
			socketRef.current = socket;
			socket.onopen = () => {
				attempt = 0;
				setStatus("open");
				const ping = () => {
					if (socket.readyState === WebSocket.OPEN)
						socket.send(JSON.stringify({ type: "ping", t: Date.now() }));
				};
				void accessToken().then((token) => {
					if (socket.readyState === WebSocket.OPEN)
						socket.send(JSON.stringify(hello(token)));
				});
				// A few quick pings to settle the clock, then a steady heartbeat.
				for (const delay of [0, 300, 900])
					quickPings.push(setTimeout(ping, delay));
				pingTimer = setInterval(ping, PING_MS);
			};
			socket.onmessage = (event) => {
				try {
					handle(JSON.parse(String(event.data)) as ServerMessage);
				} catch {
					// Ignore anything that isn't a game message.
				}
			};
			socket.onclose = (event) => {
				stopPings();
				if (socketRef.current === socket) socketRef.current = null;
				if (stopped) return;
				setStatus("reconnecting");
				// 1013: the server is full (it said so before closing); give it time.
				const delay =
					event.code === TRY_AGAIN_LATER
						? BUSY_RETRY_MS
						: Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt++);
				retryTimer = setTimeout(connect, delay);
			};
		};

		connect();
		return () => {
			stopped = true;
			clearTimeout(retryTimer);
			stopPings();
			socketRef.current?.close();
			socketRef.current = null;
		};
	}, []);

	function send(message: ClientMessage | Record<string, unknown>) {
		const socket = socketRef.current;
		if (socket?.readyState === WebSocket.OPEN)
			socket.send(JSON.stringify(message));
	}
	if (import.meta.env.DEV) devHook().send = send;

	return {
		status,
		send: (message: ClientMessage) => send(message),
		/** The server's current time in ms, for match clocks. */
		serverNow: () => Date.now() + clock.current.offset,
	};
}
