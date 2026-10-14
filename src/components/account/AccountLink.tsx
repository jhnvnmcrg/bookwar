import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// Sign-in state is only known in the browser, and the auth client is loaded after the page.
const AccountLinkInner = lazy(() => import("./AccountLinkInner"));

/** "Sign in", or the signed-in wizard's name, once the browser knows which. */
export function AccountLink() {
	return (
		<ClientOnly>
			<Suspense fallback={null}>
				<AccountLinkInner />
			</Suspense>
		</ClientOnly>
	);
}
