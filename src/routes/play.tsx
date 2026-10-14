import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { z } from "zod";
import { MODE_NAMES, secondsLabel } from "#/components/match/modes";
import { NameForm } from "#/components/match/NameForm";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { useProfile } from "#/hooks/useProfile";
import { rename } from "#/lib/account";
import {
	BOT_DIFFICULTIES,
	type BotDifficulty,
	DEFAULT_SECONDS,
	MATCH_MODES,
	type MatchMode,
	MODE_SECONDS,
} from "#/shared/protocol";

export const Route = createFileRoute("/play")({
	// The player's name and id live in this browser.
	ssr: false,
	validateSearch: z.object({
		mode: z.enum(MATCH_MODES).optional().catch(undefined),
	}),
	head: () => ({ meta: [{ title: "Duel and Siege | Bookwar" }] }),
	component: Play,
});

const DIFFICULTY: Record<BotDifficulty, { name: string; text: string }> = {
	easy: { name: "Easy", text: "Takes its time, plays short words." },
	medium: { name: "Medium", text: "A fair fight." },
	hard: { name: "Hard", text: "Quick, and hunts long words." },
};

const ABOUT: Record<MatchMode, string> = {
	duel: "You and one rival play your own boards at the same time. The higher score when the clock runs out wins, but a curse reaching the bottom of your board loses on the spot.",
	siege:
		"Up to five wizards play their own boards at once. At the end of each round the lowest score is cut, and a curse reaching the bottom knocks you out at once. The last wizard standing wins.",
};

function Choice<T extends string | number>({
	options,
	value,
	label,
	onChange,
}: {
	options: readonly T[];
	value: T;
	label: (option: T) => string;
	onChange: (option: T) => void;
}) {
	return (
		<div className="flex flex-wrap gap-2">
			{options.map((option) => (
				<Button
					key={option}
					variant={option === value ? "default" : "outline"}
					aria-pressed={option === value}
					onClick={() => onChange(option)}
				>
					{label(option)}
				</Button>
			))}
		</div>
	);
}

function Play() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const codeId = useId();
	const [profile, setProfile] = useProfile();
	const [changingName, setChangingName] = useState(false);
	// No name yet: ask for one first (a signed-in player's arrives with the account sync).
	const editingName = changingName || profile.nickname === "";
	const [mode, setModeState] = useState<MatchMode>(search.mode ?? "duel");
	const [seconds, setSeconds] = useState(
		DEFAULT_SECONDS[search.mode ?? "duel"],
	);
	const [difficulty, setDifficulty] = useState<BotDifficulty>("medium");
	const [rivals, setRivals] = useState(4);
	const [code, setCode] = useState("");
	const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
	const name = MODE_NAMES[mode];

	function setMode(next: MatchMode) {
		setModeState(next);
		setSeconds(DEFAULT_SECONDS[next]);
	}

	return (
		<main className="mx-auto max-w-xl px-4 pt-6 pb-12">
			<Link
				to="/"
				className="font-display text-xl text-gold-bright hover:text-gold"
			>
				Bookwar
			</Link>
			<h1 className="mt-8 font-stone text-4xl font-bold text-vellum">
				Duel and Siege
			</h1>

			<section aria-label="Your name" className="mt-6">
				{editingName ? (
					<NameForm
						initial={profile.nickname}
						onSave={(nickname) => {
							setProfile(rename(nickname));
							setChangingName(false);
						}}
					/>
				) : (
					<p className="text-vellum">
						Playing as{" "}
						<span className="font-stone text-xl font-bold">
							{profile.nickname}
						</span>{" "}
						<Button
							variant="link"
							className="px-1"
							onClick={() => setChangingName(true)}
						>
							Change
						</Button>
					</p>
				)}
			</section>

			{!editingName && (
				<>
					<section aria-label="Mode" className="mt-6">
						<Choice
							options={MATCH_MODES}
							value={mode}
							label={(m) => MODE_NAMES[m]}
							onChange={setMode}
						/>
						<p className="mt-3 text-vellum-dim">{ABOUT[mode]}</p>
					</section>

					<section
						aria-labelledby="quick-heading"
						className="mt-8 border-t border-gold/20 pt-6"
					>
						<h2
							id="quick-heading"
							className="font-stone text-2xl font-bold text-gold-bright"
						>
							Quick match
						</h2>
						<p className="mt-1 text-vellum-dim">
							{mode === "duel"
								? "Play the next wizard who's looking for a duel."
								: "Join wizards who are looking for a siege. It starts when five are in, or after 30 seconds."}
						</p>
						<Button
							size="lg"
							className="mt-4 font-bold"
							onClick={() => navigate({ to: "/quick/$mode", params: { mode } })}
						>
							Find a {name.toLowerCase()}
						</Button>
					</section>

					<section
						aria-labelledby="friends-heading"
						className="mt-8 border-t border-gold/20 pt-6"
					>
						<h2
							id="friends-heading"
							className="font-stone text-2xl font-bold text-gold-bright"
						>
							Play friends
						</h2>
						<p className="mt-1 text-vellum-dim">
							Create a room and send friends its code or invite link.
						</p>
						<p className="mt-4 text-sm text-vellum-dim">
							{mode === "duel" ? "Match length" : "Round length"}
						</p>
						<div className="mt-2">
							<Choice
								options={MODE_SECONDS[mode]}
								value={seconds}
								label={secondsLabel}
								onChange={setSeconds}
							/>
						</div>
						<Button
							size="lg"
							className="mt-4 font-bold"
							onClick={() =>
								navigate({
									to: "/room/$code",
									params: { code: "new" },
									search: { mode, seconds },
								})
							}
						>
							Create a {name.toLowerCase()} room
						</Button>
						<form
							className="mt-6 flex flex-wrap items-end gap-3"
							onSubmit={(event) => {
								event.preventDefault();
								if (cleanCode.length === 5) {
									navigate({ to: "/room/$code", params: { code: cleanCode } });
								}
							}}
						>
							<div>
								<label htmlFor={codeId} className="text-sm text-vellum-dim">
									Have a code?
								</label>
								<Input
									id={codeId}
									value={code}
									maxLength={5}
									autoCapitalize="characters"
									autoComplete="off"
									spellCheck={false}
									placeholder="ABCDE"
									onChange={(event) => setCode(event.target.value)}
									className="mt-1 h-11 w-36 bg-lapis-deep/60 font-stone text-xl tracking-[0.2em] uppercase"
								/>
							</div>
							<Button
								type="submit"
								size="lg"
								variant="outline"
								disabled={cleanCode.length !== 5}
							>
								Join room
							</Button>
						</form>
					</section>

					<section
						aria-labelledby="ai-heading"
						className="mt-8 border-t border-gold/20 pt-6"
					>
						<h2
							id="ai-heading"
							className="font-stone text-2xl font-bold text-gold-bright"
						>
							Play the AI
						</h2>
						<div className="mt-3">
							<Choice
								options={BOT_DIFFICULTIES}
								value={difficulty}
								label={(option) => DIFFICULTY[option].name}
								onChange={setDifficulty}
							/>
							<p className="mt-2 text-sm text-vellum-dim">
								{DIFFICULTY[difficulty].text}
							</p>
						</div>
						{mode === "siege" && (
							<div className="mt-4">
								<p className="text-sm text-vellum-dim">AI rivals</p>
								<div className="mt-2">
									<Choice
										options={[1, 2, 3, 4]}
										value={rivals}
										label={String}
										onChange={setRivals}
									/>
								</div>
							</div>
						)}
						<Button
							size="lg"
							className="mt-4 font-bold"
							onClick={() =>
								navigate({
									to: "/room/$code",
									params: { code: "new" },
									search: { mode, seconds, ai: difficulty, rivals },
								})
							}
						>
							{mode === "duel" ? "Duel the AI" : "Siege against AI"}
						</Button>
					</section>
				</>
			)}
		</main>
	);
}
