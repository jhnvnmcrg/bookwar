import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.local)");

export const db = drizzle(url, { schema });
