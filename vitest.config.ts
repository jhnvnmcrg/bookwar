// Kept separate from vite.config.ts so tests don't start the Nitro, Neon or TanStack plugins.
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
		environment: "node",
	},
});
