import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { ErrorPage, NotFoundPage } from "../components/brand/ErrorPages";
import { SkyBackdrop } from "../components/brand/SkyBackdrop";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Bookwar",
			},
			{
				name: "description",
				content:
					"Bookwar: spell words on rune stones and break curses before your tower falls.",
			},
			{
				name: "theme-color",
				content: "#0c1233",
			},
			// Always the night-sky look: dark form controls and scrollbars too.
			{ name: "color-scheme", content: "dark" },
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: "Bookwar" },
			{
				property: "og:description",
				content:
					"A spellbook word duel: spell words on rune stones, break curses, and duel other wizards.",
			},
		],
		links: [
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&family=Alegreya+SC:wght@500;700&family=Uncial+Antiqua&display=swap",
			},
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
	notFoundComponent: NotFoundPage,
	errorComponent: ErrorPage,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<SkyBackdrop />
				{children}
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
