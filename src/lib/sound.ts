// Bookwar's sounds, made on the spot with Web Audio: bell-like chimes for spells, a low
// rumble for curses, no audio files to download. The on/off choice is kept in this browser.

export type SoundName =
	/** A stone added to the word; `step` is the word's length so far. */
	| "select"
	/** A word cast; `step` is its length. */
	| "cast"
	| "reject"
	| "crystal"
	| "curse"
	| "prophecy"
	| "levelUp"
	| "shuffle"
	/** Action mode: one more stone falls. */
	| "drop"
	| "towerFall"
	/** Match countdown: 3, 2, 1… (`step` is the number). */
	| "tick"
	| "go"
	/** Siege: a wizard is cut at the end of a round. */
	| "cut"
	| "win"
	| "lose";

const KEY = "bookwar:v1:sound";

declare global {
	interface Window {
		webkitAudioContext?: typeof AudioContext;
		/** Development only: the sounds played so far, for browser tests. */
		__bookwarSounds?: string[];
	}
}

// --- The on/off setting ----------------------------------------------------------------------

function readMuted(): boolean {
	try {
		return typeof window !== "undefined" && localStorage.getItem(KEY) === "off";
	} catch {
		return false;
	}
}

let muted: boolean | null = null;
const listeners = new Set<() => void>();

export function isMuted(): boolean {
	muted ??= readMuted();
	return muted;
}

export function setMuted(value: boolean): void {
	muted = value;
	try {
		localStorage.setItem(KEY, value ? "off" : "on");
	} catch {
		// The choice lasts for this page only.
	}
	for (const listener of listeners) listener();
}

/** For useSyncExternalStore. */
export function subscribeMuted(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

// --- Synthesis ---------------------------------------------------------------------------------

let context: AudioContext | null = null;
let output: AudioNode | null = null;

/** The audio graph, created on first use (browsers allow it after the player's first tap). */
function audio(): { ctx: AudioContext; out: AudioNode } | null {
	if (typeof window === "undefined") return null;
	const Context = window.AudioContext ?? window.webkitAudioContext;
	if (!Context) return null;
	if (!context) {
		context = new Context();
		const volume = context.createGain();
		volume.gain.value = 0.55;
		// Keeps chords and stacked chimes from clipping.
		const limiter = context.createDynamicsCompressor();
		limiter.threshold.value = -12;
		limiter.ratio.value = 6;
		volume.connect(limiter).connect(context.destination);
		output = volume;
	}
	if (context.state === "suspended") void context.resume().catch(() => {});
	return output ? { ctx: context, out: output } : null;
}

interface Tone {
	readonly freq: number;
	readonly at?: number;
	readonly duration: number;
	readonly gain: number;
	readonly type?: OscillatorType;
	readonly glideTo?: number;
	readonly attack?: number;
}

function tone(ctx: AudioContext, out: AudioNode, t: Tone): void {
	const start = ctx.currentTime + (t.at ?? 0);
	const end = start + t.duration;
	const osc = ctx.createOscillator();
	const env = ctx.createGain();
	osc.type = t.type ?? "sine";
	osc.frequency.setValueAtTime(t.freq, start);
	if (t.glideTo) osc.frequency.exponentialRampToValueAtTime(t.glideTo, end);
	env.gain.setValueAtTime(0.0001, start);
	env.gain.exponentialRampToValueAtTime(t.gain, start + (t.attack ?? 0.006));
	env.gain.exponentialRampToValueAtTime(0.0001, end);
	osc.connect(env).connect(out);
	osc.start(start);
	osc.stop(end + 0.05);
}

/** A struck bell: a fundamental plus quieter, slightly out-of-tune overtones. */
function bell(
	ctx: AudioContext,
	out: AudioNode,
	freq: number,
	at: number,
	duration: number,
	gain: number,
): void {
	tone(ctx, out, { freq, at, duration, gain });
	tone(ctx, out, {
		freq: freq * 2.76,
		at,
		duration: duration * 0.6,
		gain: gain * 0.3,
	});
	tone(ctx, out, {
		freq: freq * 5.4,
		at,
		duration: duration * 0.3,
		gain: gain * 0.12,
	});
}

let noiseBuffer: AudioBuffer | null = null;

/** Filtered noise: shuffles, rumbles and thuds. */
function noise(
	ctx: AudioContext,
	out: AudioNode,
	{
		at = 0,
		duration,
		gain,
		from,
		to,
		filter = "bandpass",
	}: {
		at?: number;
		duration: number;
		gain: number;
		from: number;
		to: number;
		filter?: BiquadFilterType;
	},
): void {
	if (!noiseBuffer) {
		noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = noiseBuffer.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
	}
	const start = ctx.currentTime + at;
	const source = ctx.createBufferSource();
	source.buffer = noiseBuffer;
	source.loop = true;
	const band = ctx.createBiquadFilter();
	band.type = filter;
	band.Q.value = 1.2;
	band.frequency.setValueAtTime(from, start);
	band.frequency.exponentialRampToValueAtTime(to, start + duration);
	const env = ctx.createGain();
	env.gain.setValueAtTime(0.0001, start);
	env.gain.exponentialRampToValueAtTime(gain, start + duration * 0.2);
	env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
	source.connect(band).connect(env).connect(out);
	source.start(start);
	source.stop(start + duration + 0.05);
}

/** A pentatonic ladder in D: every step sounds good after the one before. */
const LADDER = [
	293.66, 329.63, 392, 440, 493.88, 587.33, 659.25, 783.99, 880, 987.77,
	1174.66, 1318.51, 1567.98,
];
const note = (step: number) =>
	LADDER[Math.max(0, Math.min(LADDER.length - 1, step))];

const SOUNDS: Record<
	SoundName,
	(ctx: AudioContext, out: AudioNode, step: number) => void
> = {
	select: (ctx, out, step) => bell(ctx, out, note(step + 2), 0, 0.18, 0.09),
	cast: (ctx, out, step) => {
		const count = Math.max(3, Math.min(7, step));
		for (let i = 0; i < count; i++)
			bell(ctx, out, note(i + 3), i * 0.045, 0.5, 0.12);
		bell(ctx, out, note(count + 3), count * 0.045, 0.9, 0.14);
	},
	reject: (ctx, out) => {
		tone(ctx, out, { freq: 196, duration: 0.16, gain: 0.16, type: "triangle" });
		tone(ctx, out, {
			freq: 147,
			at: 0.09,
			duration: 0.22,
			gain: 0.16,
			type: "triangle",
		});
		noise(ctx, out, {
			duration: 0.12,
			gain: 0.05,
			from: 300,
			to: 120,
			filter: "lowpass",
		});
	},
	crystal: (ctx, out) => {
		[1567.98, 1975.53, 2349.32, 2637.02, 3135.96].forEach((freq, i) => {
			bell(ctx, out, freq, 0.25 + i * 0.05, 0.4, 0.05);
		});
	},
	curse: (ctx, out) => {
		tone(ctx, out, {
			freq: 98,
			duration: 0.7,
			gain: 0.08,
			type: "sawtooth",
			glideTo: 82,
			attack: 0.15,
		});
		tone(ctx, out, {
			freq: 103.8,
			duration: 0.7,
			gain: 0.06,
			type: "sawtooth",
			glideTo: 87,
			attack: 0.15,
		});
		noise(ctx, out, {
			duration: 0.7,
			gain: 0.04,
			from: 180,
			to: 90,
			filter: "lowpass",
		});
	},
	prophecy: (ctx, out) => {
		for (const freq of [587.33, 739.99, 880, 1174.66])
			bell(ctx, out, freq, 0.2, 1.3, 0.1);
		SOUNDS.crystal(ctx, out, 0);
	},
	levelUp: (ctx, out) => {
		[0, 2, 4, 5, 7].forEach((step, i) => {
			bell(ctx, out, note(step + 2), 0.3 + i * 0.09, 0.7, 0.11);
		});
	},
	shuffle: (ctx, out) =>
		noise(ctx, out, { duration: 0.38, gain: 0.12, from: 500, to: 2600 }),
	drop: (ctx, out) =>
		tone(ctx, out, { freq: 190, duration: 0.09, gain: 0.07, glideTo: 120 }),
	towerFall: (ctx, out) => {
		noise(ctx, out, {
			duration: 1.4,
			gain: 0.22,
			from: 900,
			to: 60,
			filter: "lowpass",
		});
		tone(ctx, out, {
			freq: 220,
			duration: 1.3,
			gain: 0.12,
			type: "triangle",
			glideTo: 55,
		});
		tone(ctx, out, {
			freq: 233,
			at: 0.1,
			duration: 1.2,
			gain: 0.08,
			type: "triangle",
			glideTo: 58,
		});
	},
	/** `step` is the number shown; the last one rings a little higher. */
	tick: (ctx, out, step) =>
		bell(ctx, out, step === 1 ? 1174.66 : 880, 0, 0.12, 0.1),
	go: (ctx, out) => bell(ctx, out, 1318.51, 0, 0.5, 0.14),
	cut: (ctx, out) => {
		bell(ctx, out, 110, 0, 2, 0.22);
		bell(ctx, out, 164.81, 0.02, 1.6, 0.1);
	},
	win: (ctx, out) => {
		[293.66, 369.99, 440, 587.33].forEach((freq, i) => {
			bell(ctx, out, freq, i * 0.12, 1, 0.13);
		});
		for (const freq of [587.33, 739.99, 880])
			bell(ctx, out, freq, 0.5, 1.6, 0.1);
	},
	lose: (ctx, out) => {
		[440, 349.23, 293.66].forEach((freq, i) => {
			tone(ctx, out, {
				freq,
				at: i * 0.22,
				duration: 0.6,
				gain: 0.12,
				type: "triangle",
			});
		});
	},
};

/** Plays a sound, unless sound is off or the browser has no Web Audio. Never throws. */
export function playSound(name: SoundName, step = 0): void {
	if (import.meta.env.DEV && typeof window !== "undefined") {
		window.__bookwarSounds ??= [];
		window.__bookwarSounds.push(name);
	}
	if (isMuted()) return;
	try {
		const graph = audio();
		if (graph) SOUNDS[name](graph.ctx, graph.out, step);
	} catch {
		// Sound is a nicety; the game never depends on it.
	}
}
