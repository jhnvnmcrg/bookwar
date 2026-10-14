import { createFileRoute, Link } from "@tanstack/react-router";
import { AccountPanel } from "#/components/account/AccountPanel";
import { SignInPanel } from "#/components/account/SignInPanel";
import { Nox } from "#/components/brand/Nox";
import { useAccount } from "#/hooks/useAccount";

export const Route = createFileRoute("/account")({
	// Sign-in state lives in the browser (Neon Auth's session).
	ssr: false,
	head: () => ({ meta: [{ title: "Account | Bookwar" }] }),
	component: AccountPage,
});

function AccountPage() {
	const account = useAccount();

	return (
		<main className="mx-auto max-w-xl px-4 pt-6 pb-12">
			<Link
				to="/"
				className="font-display text-xl text-gold-bright hover:text-gold"
			>
				Bookwar
			</Link>
			{account.status === "off" && (
				<section className="mt-8">
					<h1 className="font-stone text-4xl font-bold text-vellum">
						Accounts are off
					</h1>
					<p className="mt-2 text-vellum-dim">
						This server isn't set up for accounts, so everyone plays as a guest.
						Scores are kept in this browser.
					</p>
				</section>
			)}
			{account.status === "loading" && (
				<div className="mt-16 text-center">
					<Nox mood="idle" className="mx-auto h-24 w-20" />
					<p className="mt-3 text-vellum-dim">Checking your account…</p>
				</div>
			)}
			{account.status === "guest" && <SignInPanel />}
			{account.status === "signed-in" && (
				<AccountPanel
					userId={account.userId}
					email={account.email}
					nickname={account.nickname}
				/>
			)}
		</main>
	);
}
