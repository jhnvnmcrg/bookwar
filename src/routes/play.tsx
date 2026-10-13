import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { NameForm } from "#/components/duel/NameForm";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { loadProfile, saveNickname } from "#/lib/profile";
import {
	BOT_DIFFICULTIES,
	type BotDifficulty,
	DEFAULT_DUEL_SECONDS,
	DUEL_DURATIONS,
	type DuelDuration,
} from "#/shared/protocol";

export const Route = createFileRoute("/play")({
	// The player's name and id live in this browser.
	ssr: false,
	head: () => ({ meta: [{ title: "Duel | Bookwar" }] }),
	component: Play,
});

const DIFFICULTY: Record<BotDifficulty, { name: string; text: string }> = {
	easy: { name: "Easy", text: "Takes its time, plays short words." },
	medium: { name: "Medium", text: "A fair fight." },
	hard: { name: "Hard", text: "Quick, and hunts long words." },
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
	const navigate = useNavigate();
	const codeId = useId();
	const [profile, setProfile] = useState(loadProfile);
	const [editingName, setEditingName] = useState(profile.nickname === "");
	const [length, setLength] = useState<DuelDuration>(DEFAULT_DUEL_SECONDS);
	const [difficulty, setDifficulty] = useState<BotDifficulty>("medium");
	const [code, setCode] = useState("");
	const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

	return (
		<main className="mx-auto max-w-xl px-4 pt-6 pb-12">
			<Link
				to="/"
				className="font-display text-xl text-gold-bright hover:text-gold"
			>
				Bookwar
			</Link>
			<h1 className="mt-8 font-stone text-4xl font-bold text-vellum">Duel</h1>
			<p className="mt-2 text-vellum-dim">
				You and a rival play your own boards at the same time. The higher score
				when the clock runs out wins, but a curse reaching the bottom of your
				board loses on the spot.
			</p>

			<section aria-label="Your name" className="mt-8">
				{editingName ? (
					<NameForm
						initial={profile.nickname}
						onSave={(name) => {
							setProfile(saveNickname(name));
							setEditingName(false);
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
							onClick={() => setEditingName(true)}
						>
							Change
						</Button>
					</p>
				)}
			</section>

			{!editingName && (
				<>
					<section aria-labelledby="length-heading" className="mt-8">
						<h2 id="length-heading" className="text-sm text-vellum-dim">
							Match length
						</h2>
						<div className="mt-2">
							<Choice
								options={DUEL_DURATIONS}
								value={length}
								label={(seconds) => `${seconds / 60} min`}
								onChange={setLength}
							/>
						</div>
					</section>

					<section
						aria-labelledby="friend-heading"
						className="mt-8 border-t border-gold/20 pt-6"
					>
						<h2
							id="friend-heading"
							className="font-stone text-2xl font-bold text-gold-bright"
						>
							Play a friend
						</h2>
						<p className="mt-1 text-vellum-dim">
							Create a room and send your friend its code or invite link.
						</p>
						<Button
							size="lg"
							className="mt-4 font-bold"
							onClick={() =>
								navigate({
									to: "/room/$code",
									params: { code: "new" },
									search: { length },
								})
							}
						>
							Create a room
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
						<Button
							size="lg"
							className="mt-4 font-bold"
							onClick={() =>
								navigate({
									to: "/room/$code",
									params: { code: "new" },
									search: { length, bot: difficulty },
								})
							}
						>
							Duel the AI
						</Button>
					</section>
				</>
			)}
		</main>
	);
}
