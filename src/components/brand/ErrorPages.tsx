import {
	type ErrorComponentProps,
	Link,
	useRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { Nox } from "./Nox";

function Page({ title, children }: { title: string; children: ReactNode }) {
	return (
		<main className="grid min-h-dvh place-items-center px-4 py-12 text-center">
			<div className="max-w-md">
				<Nox mood="worried" className="mx-auto h-28 w-24" />
				<h1 className="mt-4 font-stone text-4xl font-bold text-vellum">
					{title}
				</h1>
				{children}
			</div>
		</main>
	);
}

/** Any address that isn't a page (or a room code that doesn't exist). */
export function NotFoundPage() {
	return (
		<Page title="This page isn't in the spellbook">
			<p className="mt-2 text-vellum-dim">
				Check the address, or head back and pick a game.
			</p>
			<Button size="lg" className="mt-6 font-bold" asChild>
				<Link to="/">Back to the title screen</Link>
			</Button>
		</Page>
	);
}

/** Something broke while showing a page. */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
	const router = useRouter();
	return (
		<Page title="Something went wrong">
			<p className="mt-2 text-vellum-dim">
				The page hit an error. Try again; if it keeps happening, reload the
				page. Your saved games are safe in this browser.
			</p>
			{import.meta.env.DEV && error instanceof Error && (
				<pre className="mt-4 overflow-x-auto rounded-md bg-lapis-deep/80 p-3 text-left text-sm text-rubric">
					{error.message}
				</pre>
			)}
			<div className="mt-6 flex flex-wrap justify-center gap-3">
				<Button
					size="lg"
					className="font-bold"
					onClick={() => {
						reset();
						void router.invalidate();
					}}
				>
					Try again
				</Button>
				<Button size="lg" variant="outline" asChild>
					<Link to="/">Back to the title screen</Link>
				</Button>
			</div>
		</Page>
	);
}
