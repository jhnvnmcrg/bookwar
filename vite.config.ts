import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import neon from "./neon-vite-plugin.ts";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		devtools(),
		nitro({
			// Live games: the game server's WebSocket endpoint.
			features: { websocket: true },
			routes: { "/api/ws": "./src/server/ws.ts" },
			rollupConfig: { external: [/^@sentry\//] },
			routeRules: {
				// Basic hardening for every response; the host adds HTTPS (and HSTS).
				"/**": {
					headers: {
						"X-Content-Type-Options": "nosniff",
						"Referrer-Policy": "strict-origin-when-cross-origin",
						"X-Frame-Options": "DENY",
						"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
					},
				},
			},
		}),
		neon,
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
	],
});

export default config;
