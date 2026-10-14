import { type ComponentProps, type FormEvent, useId, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";
import { loadProfile, saveNickname } from "#/lib/profile";
import { NAME_MAX, nameProblem, tidyName } from "#/shared/names";

type View = "sign-in" | "sign-up" | "reset-request" | "reset-code";

const PASSWORD_MIN = 8;

const HEADINGS: Record<View, { title: string; intro: string }> = {
	"sign-in": {
		title: "Sign in",
		intro:
			"Your Solo scores go on the leaderboard and your matches are kept. Every mode also works as a guest.",
	},
	"sign-up": {
		title: "Create an account",
		intro:
			"Your scores from this browser come with you, and new ones go on the leaderboard.",
	},
	"reset-request": {
		title: "Reset your password",
		intro: "We'll email you a code to set a new password.",
	},
	"reset-code": {
		title: "Enter your code",
		intro: "Check your email for a 6-digit code, then choose a new password.",
	},
};

/** Turns what the auth service sends back into a sentence that says what to do. */
function authProblem(error: unknown): string {
	const details = (error ?? {}) as {
		code?: unknown;
		status?: unknown;
		message?: unknown;
	};
	const code = String(details.code ?? "").toLowerCase();
	const message = typeof details.message === "string" ? details.message : "";
	if (
		code.includes("credentials") ||
		code.includes("invalid_email_or_password")
	)
		return "That email and password don't match an account.";
	if (code.includes("already_exists") || code.includes("email_exists"))
		return "There's already an account with that email. Sign in instead.";
	if (code.includes("weak_password") || code.includes("password_too_short"))
		return `Use a longer password: at least ${PASSWORD_MIN} characters.`;
	if (code.includes("otp") || /code|otp/i.test(message))
		return "That code didn't work. Check it, or ask for a new one.";
	if (code.includes("rate_limit") || details.status === 429)
		return "Too many tries. Wait a minute, then try again.";
	if (code.includes("email")) return "Check the email address.";
	if (details.status === 0 || /fetch|network/i.test(message))
		return "Couldn't reach the sign-in service. Check your connection and try again.";
	return message || "Something went wrong. Try again.";
}

/** Runs an auth call and returns a problem to show, or null when it worked. */
async function attempt(
	call: () => Promise<{ error?: unknown } | undefined>,
): Promise<string | null> {
	try {
		const result = await call();
		return result?.error ? authProblem(result.error) : null;
	} catch (error) {
		return authProblem(error);
	}
}

function Field({
	label,
	hint,
	...props
}: { label: string; hint?: string } & ComponentProps<typeof Input>) {
	const id = useId();
	return (
		<div>
			<label htmlFor={id} className="text-sm text-vellum-dim">
				{label}
			</label>
			<Input
				id={id}
				aria-describedby={hint ? `${id}-hint` : undefined}
				className="mt-1 h-11 bg-lapis-deep/60 text-lg"
				{...props}
			/>
			{hint && (
				<p id={`${id}-hint`} className="mt-1 text-sm text-vellum-dim">
					{hint}
				</p>
			)}
		</div>
	);
}

/** Sign in, create an account, or reset a forgotten password. */
export function SignInPanel() {
	const [view, setView] = useState<View>("sign-in");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState(() => loadProfile().nickname);
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const heading = HEADINGS[view];

	function show(next: View) {
		setView(next);
		setProblem(null);
		setNotice(null);
		setPassword("");
	}

	async function run(work: () => Promise<string | null>) {
		setBusy(true);
		setProblem(null);
		const result = await work();
		setBusy(false);
		if (result) setProblem(result);
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		const address = email.trim();
		const auth = authClient();
		switch (view) {
			case "sign-in":
				void run(() =>
					attempt(() => auth.signIn.email({ email: address, password })),
				);
				return;
			case "sign-up": {
				const wizard = tidyName(name);
				if (nameProblem(wizard)) {
					setProblem(
						`Pick a wizard name of 2 to ${NAME_MAX} letters, numbers or spaces.`,
					);
					return;
				}
				if (password.length < PASSWORD_MIN) {
					setProblem(
						`Use at least ${PASSWORD_MIN} characters for your password.`,
					);
					return;
				}
				// The account takes this browser's wizard name when it's first synced.
				saveNickname(wizard);
				void run(() =>
					attempt(() =>
						auth.signUp.email({ email: address, password, name: wizard }),
					),
				);
				return;
			}
			case "reset-request":
				void run(async () => {
					const failed = await attempt(() =>
						auth.emailOtp.requestPasswordReset({ email: address }),
					);
					if (!failed) {
						setView("reset-code");
						setNotice(`If ${address} has an account, a code is on its way.`);
					}
					return failed;
				});
				return;
			case "reset-code":
				if (password.length < PASSWORD_MIN) {
					setProblem(
						`Use at least ${PASSWORD_MIN} characters for your password.`,
					);
					return;
				}
				void run(async () => {
					const failed = await attempt(() =>
						auth.emailOtp.resetPassword({
							email: address,
							otp: code.trim(),
							password,
						}),
					);
					if (!failed) {
						show("sign-in");
						setNotice("Your password is changed. Sign in with the new one.");
					}
					return failed;
				});
				return;
		}
	}

	function google() {
		void run(() =>
			attempt(() =>
				authClient().signIn.social({
					provider: "google",
					callbackURL: `${window.location.origin}/account`,
				}),
			),
		);
	}

	const submitLabel = {
		"sign-in": busy ? "Signing in…" : "Sign in",
		"sign-up": busy ? "Creating your account…" : "Create account",
		"reset-request": busy ? "Sending…" : "Send me a code",
		"reset-code": busy ? "Saving…" : "Set new password",
	}[view];

	return (
		<section aria-labelledby="auth-heading" className="mt-8">
			<h1
				id="auth-heading"
				className="font-stone text-4xl font-bold text-vellum"
			>
				{heading.title}
			</h1>
			<p className="mt-2 text-vellum-dim">{heading.intro}</p>

			{(view === "sign-in" || view === "sign-up") && (
				<>
					<Button
						type="button"
						variant="outline"
						size="lg"
						className="mt-6 w-full"
						disabled={busy}
						onClick={google}
					>
						Continue with Google
					</Button>
					<p className="mt-6 flex items-center gap-3 text-sm text-vellum-dim before:h-px before:flex-1 before:bg-gold/25 after:h-px after:flex-1 after:bg-gold/25">
						or with email
					</p>
				</>
			)}

			<form className="mt-4 flex flex-col gap-4" onSubmit={submit} noValidate>
				{view === "sign-up" && (
					<Field
						label="Wizard name"
						hint="Shown to rivals and on the leaderboard."
						value={name}
						maxLength={NAME_MAX + 4}
						autoComplete="nickname"
						required
						onChange={(event) => setName(event.target.value)}
					/>
				)}
				{view !== "reset-code" && (
					<Field
						label="Email"
						type="email"
						value={email}
						autoComplete="email"
						required
						onChange={(event) => setEmail(event.target.value)}
					/>
				)}
				{view === "reset-code" && (
					<Field
						label="Code from the email"
						value={code}
						inputMode="numeric"
						autoComplete="one-time-code"
						required
						onChange={(event) => setCode(event.target.value)}
					/>
				)}
				{view !== "reset-request" && (
					<Field
						label={view === "reset-code" ? "New password" : "Password"}
						type="password"
						value={password}
						autoComplete={
							view === "sign-in" ? "current-password" : "new-password"
						}
						hint={
							view === "sign-in"
								? undefined
								: `At least ${PASSWORD_MIN} characters.`
						}
						required
						onChange={(event) => setPassword(event.target.value)}
					/>
				)}

				{problem && (
					<p role="alert" className="text-rubric">
						{problem}
					</p>
				)}
				{notice && !problem && (
					<p aria-live="polite" className="text-verdigris">
						{notice}
					</p>
				)}

				<Button type="submit" size="lg" className="font-bold" disabled={busy}>
					{submitLabel}
				</Button>
			</form>

			<div className="mt-6 flex flex-col items-start gap-1 text-vellum-dim">
				{view === "sign-in" && (
					<>
						<p>
							New to Bookwar?{" "}
							<Button
								variant="link"
								className="h-auto px-0"
								onClick={() => show("sign-up")}
							>
								Create an account
							</Button>
						</p>
						<Button
							variant="link"
							className="h-auto px-0"
							onClick={() => show("reset-request")}
						>
							Forgot your password?
						</Button>
					</>
				)}
				{view !== "sign-in" && (
					<p>
						{view === "sign-up" ? "Already have an account? " : ""}
						<Button
							variant="link"
							className="h-auto px-0"
							onClick={() => show("sign-in")}
						>
							{view === "sign-up" ? "Sign in" : "Back to sign in"}
						</Button>
					</p>
				)}
			</div>
		</section>
	);
}
