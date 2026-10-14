// The database client. Server code only. Created on first use and kept on globalThis: the game
// server and the rest of the app are bundled separately but should share one connection pool.
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema.ts";

export type Database = NodePgDatabase<typeof schema>;

const shared = globalThis as typeof globalThis & { __bookwarDb?: Database };

/** True when a database is configured (accounts and leaderboards need one). */
export function hasDatabase(): boolean {
	return Boolean(process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL);
}

/**
 * node-postgres already treats `sslmode=require` as `verify-full` (check the certificate and
 * host name) but warns that this will change; say so explicitly to keep that behaviour.
 */
function withFullTls(connectionString: string): string {
	const url = new URL(connectionString);
	const mode = url.searchParams.get("sslmode");
	if (mode === "require" || mode === "prefer" || mode === "verify-ca")
		url.searchParams.set("sslmode", "verify-full");
	return url.toString();
}

export function getDb(): Database {
	if (shared.__bookwarDb) return shared.__bookwarDb;
	// App traffic goes through Neon's connection pooler; migrations use the direct URL.
	const url = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is not set (see .env.local)");
	const pool = new pg.Pool({ connectionString: withFullTls(url), max: 10 });
	shared.__bookwarDb = drizzle(pool, { schema });
	return shared.__bookwarDb;
}
