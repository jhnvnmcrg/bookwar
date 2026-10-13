import { postgres } from "vite-plugin-neon-new";

export default postgres({
	referrer: "create-tanstack",
	dotEnvKey: "DATABASE_URL",
});
