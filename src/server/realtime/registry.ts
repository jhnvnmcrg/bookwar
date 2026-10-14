// The one hub for this server process. It lives on globalThis because the WebSocket handler
// and the rest of the app are bundled separately (and dev reloads re-run modules), but must
// share the same rooms.
import { hasDatabase } from "../../db";
import { loadDictionary } from "../../game/dictionary";
import { verifyAccessToken } from "../accounts/auth-token.server";
import { recordMatch } from "../accounts/records.server";
import { Hub } from "./hub";

const shared = globalThis as typeof globalThis & { __bookwarHub?: Hub };

export function gameHub(): Hub {
	shared.__bookwarHub ??= new Hub({
		loadWords: loadDictionary,
		verifyToken: async (token) =>
			(await verifyAccessToken(token))?.userId ?? null,
		recordMatch: async (record) => {
			if (hasDatabase()) await recordMatch(record);
		},
	});
	return shared.__bookwarHub;
}
