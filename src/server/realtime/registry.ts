// The one hub for this server process. It lives on globalThis because the WebSocket handler
// and the rest of the app are bundled separately (and dev reloads re-run modules), but must
// share the same rooms.
import { loadDictionary } from "../../game/dictionary";
import { Hub } from "./hub";

const shared = globalThis as typeof globalThis & { __bookwarHub?: Hub };

export function gameHub(): Hub {
	shared.__bookwarHub ??= new Hub({ loadWords: loadDictionary });
	return shared.__bookwarHub;
}
