import { createFileRoute } from "@tanstack/react-router";

/** For the host's health checks: the server is up and answering. */
export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: () =>
				Response.json(
					{ ok: true },
					{ headers: { "Cache-Control": "no-store" } },
				),
		},
	},
});
