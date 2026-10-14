// For server functions that need a signed-in player: the browser side attaches the login
// token, the server side checks it and puts the player in the handler's context.
import { createMiddleware } from "@tanstack/react-start";
import {
	getRequestHeader,
	setResponseStatus,
} from "@tanstack/react-start/server";
import { bearerToken, verifyAccessToken } from "./auth-token.server";

export const signedIn = createMiddleware({ type: "function" })
	.client(async ({ next }) => {
		// Loaded on demand so pages that never call these functions skip the auth client.
		const { accessToken } = await import("#/lib/auth-client");
		const token = await accessToken();
		// Signed out (or signing out): no point asking. The server checks every call anyway.
		if (!token) throw new Error("Sign in to do that.");
		return next({ headers: { Authorization: `Bearer ${token}` } });
	})
	.server(async ({ next }) => {
		const token = bearerToken(getRequestHeader("authorization"));
		const user = token ? await verifyAccessToken(token) : null;
		if (!user) {
			setResponseStatus(401);
			throw new Error("Sign in to do that.");
		}
		return next({ context: { user } });
	});
