import { useId, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { NAME_MAX, nameProblem, tidyName } from "#/shared/names";

const PROBLEMS = {
	"too-short": "Use at least 2 characters.",
	"too-long": `Use at most ${NAME_MAX} characters.`,
	"bad-characters": "Use letters, numbers, spaces, ' _ or -.",
	"not-allowed": "Pick a different name.",
} as const;

/** "Your wizard name": the name rivals see. */
export function NameForm({
	initial,
	onSave,
	submitLabel = "Save name",
}: {
	initial: string;
	onSave: (name: string) => void;
	submitLabel?: string;
}) {
	const id = useId();
	const [value, setValue] = useState(initial);
	const [touched, setTouched] = useState(false);
	const name = tidyName(value);
	const problem = nameProblem(name);

	return (
		<form
			className="flex flex-wrap items-end gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				setTouched(true);
				if (!problem) onSave(name);
			}}
		>
			<div className="min-w-56 flex-1">
				<label htmlFor={id} className="text-sm text-vellum-dim">
					Your wizard name
				</label>
				<Input
					id={id}
					value={value}
					maxLength={NAME_MAX + 4}
					autoComplete="nickname"
					placeholder="For example: Ember Quill"
					aria-invalid={touched && problem !== null}
					aria-describedby={`${id}-help`}
					onChange={(event) => setValue(event.target.value)}
					className="mt-1 h-11 bg-lapis-deep/60 text-lg"
				/>
				<p
					id={`${id}-help`}
					className={`mt-1 text-sm ${touched && problem ? "text-rubric" : "text-vellum-dim"}`}
				>
					{touched && problem
						? PROBLEMS[problem]
						: "Rivals see this name during a duel."}
				</p>
			</div>
			<Button type="submit" size="lg" className="mb-7 font-bold">
				{submitLabel}
			</Button>
		</form>
	);
}
