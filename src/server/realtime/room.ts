// One multiplayer room, Duel or Siege: seats, the waiting → countdown → playing (→ roundEnd →
// playing …) → finished cycle, and the referee. The server owns every board; players only
// send the stones they picked.
import { createGame, reduce } from "../../game/reducer";
import { Rng } from "../../game/rng";
import type {
	GameAction,
	GameEvent,
	GameState,
	WordList,
} from "../../game/types";
import {
	type BotDifficulty,
	COUNTDOWN_MS,
	type EndReason,
	type ErrorCode,
	encodeMini,
	type MatchMode,
	type MatchResult,
	MODE_SEATS,
	MODE_SECONDS,
	type MoveError,
	type OutReason,
	RECONNECT_GRACE_MS,
	ROUND_BREAK_MS,
	type RoomPhase,
	type RoomView,
	type ServerMessage,
	toPublicState,
} from "../../shared/protocol";
import { BOT_NAMES, type BotHost } from "../bot/bot";

export interface Connection {
	send(message: ServerMessage): void;
}

type Timer = ReturnType<typeof setTimeout>;

export interface RoomDeps {
	readonly words: WordList;
	/** Unique random string, for seat ids and match seeds. */
	readonly randomId: () => string;
	readonly now?: () => number;
	/** A guest no longer has a seat here (left, removed, or the room closed). */
	readonly onSeatGone: (guestId: string, room: Room) => void;
	readonly onClose: (room: Room) => void;
	/** Starts the AI for a bot seat and returns a function that stops it. */
	readonly startBot: (
		room: Room,
		seatId: string,
		difficulty: BotDifficulty,
	) => () => void;
	/** Builds each seat's game at match start (tests swap in prepared boards). */
	readonly newGame?: (seed: string, seatIndex: number) => GameState;
	/** A match just ended (for match history). */
	readonly onFinished?: (summary: MatchSummary) => void;
}

/** A finished match, seat by seat, for the match history. */
export interface MatchSummary {
	readonly code: string;
	readonly mode: MatchMode;
	readonly seconds: number;
	/** Siege rounds played; 1 for a Duel. */
	readonly rounds: number;
	readonly reason: EndReason;
	readonly startedAt: number;
	readonly endedAt: number;
	readonly players: readonly {
		/** Seat order in the room, from 0. */
		readonly seat: number;
		readonly guestId: string | null;
		readonly name: string;
		readonly bot: BotDifficulty | null;
		readonly score: number;
		readonly place: number;
		readonly won: boolean;
		readonly out: OutReason | null;
		readonly outRound: number | null;
	}[];
}

export type RoomError = Extract<
	ErrorCode,
	| "room-full"
	| "match-running"
	| "not-host"
	| "need-two-players"
	| "not-in-room"
	| "bad-setting"
>;

interface Seat {
	readonly seatId: string;
	readonly guestId: string | null;
	readonly name: string;
	readonly bot: BotDifficulty | null;
	connection: Connection | null;
	game: GameState | null;
	/** When the score last went up; on a tie the earlier player wins. */
	scoredAt: number;
	out: OutReason | null;
	outRound: number | null;
	/** 1 for the first player out, 2 for the next…; sets the final places. */
	outOrder: number;
	graceTimer: Timer | null;
	stopBot: (() => void) | null;
}

/** Rooms nobody is using close after this long in the lobby or on the results screen. */
const IDLE_CLOSE_MS = 10 * 60_000;
const FINISHED_CLOSE_MS = 2 * 60_000;
/** The phases in which a match is under way. */
const LIVE: readonly RoomPhase[] = ["playing", "roundEnd"];

export class Room implements BotHost {
	phase: RoomPhase = "waiting";
	seconds: number;
	round = 0;
	phaseEndsAt: number | null = null;
	result: MatchResult | null = null;
	cut: { seatId: string; round: number } | null = null;
	closed = false;
	private readonly seats: Seat[] = [];
	private hostSeatId: string | null = null;
	private phaseTimer: Timer | null = null;
	private idleTimer: Timer | null = null;
	private matchSeed = "";
	private outCount = 0;
	private startedAt = 0;

	constructor(
		readonly code: string,
		readonly mode: MatchMode,
		seconds: number,
		private readonly deps: RoomDeps,
	) {
		this.seconds = seconds;
		this.scheduleIdleClose();
	}

	/** True when `seconds` is one of the times players can pick for this mode. */
	static validSeconds(mode: MatchMode, seconds: number): boolean {
		return (MODE_SECONDS[mode] as readonly number[]).includes(seconds);
	}

	private get capacity(): number {
		return MODE_SEATS[this.mode];
	}

	private now(): number {
		return this.deps.now?.() ?? Date.now();
	}

	private seatOfGuest(guestId: string): Seat | undefined {
		return this.seats.find((seat) => seat.guestId === guestId);
	}

	hasGuest(guestId: string): boolean {
		return this.seatOfGuest(guestId) !== undefined;
	}

	gameOf(seatId: string): GameState | null {
		return this.seats.find((seat) => seat.seatId === seatId)?.game ?? null;
	}

	// --- Membership -----------------------------------------------------------------------

	join(
		guestId: string,
		name: string,
		connection: Connection,
	): RoomError | null {
		if (this.seatOfGuest(guestId)) {
			this.attach(guestId, connection);
			return null;
		}
		if (this.phase !== "waiting") return "match-running";
		if (this.seats.length >= this.capacity) return "room-full";
		const seat = this.addSeat({ guestId, name, bot: null, connection });
		this.hostSeatId ??= seat.seatId;
		this.changed();
		return null;
	}

	/** A guest's (new) socket takes over their seat, e.g. after a reconnect. */
	attach(guestId: string, connection: Connection): void {
		const seat = this.seatOfGuest(guestId);
		if (!seat) return;
		seat.connection = connection;
		if (seat.graceTimer) clearTimeout(seat.graceTimer);
		seat.graceTimer = null;
		this.sendEverything(seat);
		this.broadcastRoom();
	}

	/** A guest's socket closed. They keep the seat for RECONNECT_GRACE_MS. */
	detach(guestId: string, connection: Connection): void {
		const seat = this.seatOfGuest(guestId);
		if (!seat || seat.connection !== connection) return;
		seat.connection = null;
		seat.graceTimer = setTimeout(
			() => this.graceOver(seat),
			RECONNECT_GRACE_MS,
		);
		this.broadcastRoom();
	}

	private graceOver(seat: Seat): void {
		seat.graceTimer = null;
		if (seat.connection) return;
		if (this.phase === "countdown") this.cancelCountdown();
		if (LIVE.includes(this.phase)) {
			this.knockOut(seat, "left");
			// The seat stays on the scoreboard. With nobody watching or able to come back, the
			// match ends here.
			if (!this.anyoneMayReturn()) this.close();
			return;
		}
		if (this.phase !== "finished" || !this.seats.some((s) => s.connection)) {
			this.removeSeat(seat);
		}
	}

	/** Someone is connected, or disconnected but still within their time to reconnect. */
	private anyoneMayReturn(): boolean {
		return this.seats.some((s) => s.connection || s.graceTimer);
	}

	leave(guestId: string): void {
		const seat = this.seatOfGuest(guestId);
		if (!seat) return;
		seat.connection?.send({ type: "left" });
		seat.connection = null;
		if (seat.graceTimer) clearTimeout(seat.graceTimer);
		if (this.phase === "countdown") this.cancelCountdown();
		if (LIVE.includes(this.phase)) {
			// Forfeit: the seat stays on the results, but the guest is free to go elsewhere.
			this.knockOut(seat, "left");
			this.deps.onSeatGone(guestId, this);
			if (!this.anyoneMayReturn()) this.close();
			return;
		}
		this.removeSeat(seat);
	}

	addBot(guestId: string, difficulty: BotDifficulty): RoomError | null {
		const error = this.hostCheck(guestId);
		if (error) return error;
		if (this.seats.length >= this.capacity) return "room-full";
		const taken = this.seats.filter((s) => s.bot === difficulty).length;
		this.addSeat({
			guestId: null,
			// A second "Adept Elowen" becomes "Adept Elowen II".
			name: `${BOT_NAMES[difficulty]}${["", " II", " III", " IV", " V"][taken] ?? ""}`,
			bot: difficulty,
			connection: null,
		});
		this.changed();
		return null;
	}

	/** The host can remove an AI rival from the lobby. */
	removeBot(guestId: string, seatId: string): RoomError | null {
		const error = this.hostCheck(guestId);
		if (error) return error;
		const seat = this.seats.find((s) => s.seatId === seatId && s.bot);
		if (!seat) return "not-in-room";
		this.removeSeat(seat);
		return null;
	}

	setSeconds(guestId: string, seconds: number): RoomError | null {
		const error = this.hostCheck(guestId);
		if (error) return error;
		if (!Room.validSeconds(this.mode, seconds)) return "bad-setting";
		this.seconds = seconds;
		this.changed();
		return null;
	}

	start(guestId: string): RoomError | null {
		const error = this.hostCheck(guestId);
		if (error) return error;
		return this.startCountdown();
	}

	/** Starts without a host's say-so (quick matches and AI games). */
	startCountdown(): RoomError | null {
		if (this.phase !== "waiting") return "match-running";
		if (this.seats.length < 2) return "need-two-players";
		this.clearIdle();
		this.phase = "countdown";
		this.phaseEndsAt = this.now() + COUNTDOWN_MS;
		this.phaseTimer = setTimeout(() => this.beginMatch(), COUNTDOWN_MS);
		this.broadcastRoom();
		return null;
	}

	/** After a match, anyone still here can return the room to the lobby for another go. */
	rematch(guestId: string): RoomError | null {
		if (!this.seatOfGuest(guestId)) return "not-in-room";
		if (this.phase !== "finished") return "match-running";
		for (const seat of [...this.seats]) {
			if (!seat.bot && (!seat.connection || seat.out === "left"))
				this.removeSeat(seat);
		}
		if (this.closed) return null;
		for (const seat of this.seats) {
			seat.game = null;
			seat.out = null;
			seat.outRound = null;
			seat.outOrder = 0;
		}
		this.phase = "waiting";
		this.round = 0;
		this.cut = null;
		this.result = null;
		this.changed();
		return null;
	}

	private hostCheck(guestId: string): RoomError | null {
		const seat = this.seatOfGuest(guestId);
		if (!seat) return "not-in-room";
		if (seat.seatId !== this.hostSeatId) return "not-host";
		if (this.phase !== "waiting") return "match-running";
		return null;
	}

	private addSeat(
		fields: Pick<Seat, "guestId" | "name" | "bot" | "connection">,
	): Seat {
		const seat: Seat = {
			...fields,
			seatId: this.deps.randomId().slice(0, 12),
			game: null,
			scoredAt: 0,
			out: null,
			outRound: null,
			outOrder: 0,
			graceTimer: null,
			stopBot: null,
		};
		this.seats.push(seat);
		return seat;
	}

	private removeSeat(seat: Seat): void {
		const index = this.seats.indexOf(seat);
		if (index === -1) return;
		this.seats.splice(index, 1);
		if (seat.graceTimer) clearTimeout(seat.graceTimer);
		seat.stopBot?.();
		if (seat.guestId) this.deps.onSeatGone(seat.guestId, this);
		if (this.hostSeatId === seat.seatId) {
			this.hostSeatId = this.seats.find((s) => !s.bot)?.seatId ?? null;
		}
		if (!this.seats.some((s) => !s.bot)) {
			this.close();
			return;
		}
		this.changed();
	}

	// --- The match -------------------------------------------------------------------------

	private cancelCountdown(): void {
		if (this.phaseTimer) clearTimeout(this.phaseTimer);
		this.phaseTimer = null;
		this.phase = "waiting";
		this.phaseEndsAt = null;
	}

	private beginMatch(): void {
		this.matchSeed = this.deps.randomId();
		this.outCount = 0;
		this.cut = null;
		const start = this.now();
		this.startedAt = start;
		const newGame =
			this.deps.newGame ??
			((seed: string) => createGame({ mode: "classic", seed }));
		this.seats.forEach((seat, i) => {
			// Every seat gets its own stones; the seed never leaves the server.
			seat.game = newGame(`${this.matchSeed}-${i}`, i);
			seat.scoredAt = start;
			seat.out = null;
			seat.outRound = null;
			seat.outOrder = 0;
		});
		this.round = this.mode === "siege" ? 1 : 0;
		this.startPlaying();
		for (const seat of this.seats) {
			this.sendBoard(seat, null, null, []);
			this.broadcastMini(seat);
		}
		this.broadcastRoom();
		for (const seat of this.seats) {
			if (seat.bot)
				seat.stopBot = this.deps.startBot(this, seat.seatId, seat.bot);
		}
	}

	/** Runs the clock: the whole match for a Duel, one round for a Siege. */
	private startPlaying(): void {
		this.phase = "playing";
		this.phaseEndsAt = this.now() + this.seconds * 1000;
		this.phaseTimer = setTimeout(
			() => (this.mode === "siege" ? this.endRound() : this.finish("time")),
			this.seconds * 1000,
		);
	}

	/** Siege: the lowest score is cut; then a short break, or the end if one wizard is left. */
	private endRound(): void {
		const alive = this.alive();
		if (alive.length > 1) {
			const cut = this.lowestScore(alive);
			this.markOut(cut, "cut");
			this.cut = { seatId: cut.seatId, round: this.round };
		}
		if (this.alive().length <= 1) {
			this.finish("last-standing");
			return;
		}
		this.phase = "roundEnd";
		this.phaseEndsAt = this.now() + ROUND_BREAK_MS;
		this.phaseTimer = setTimeout(() => {
			this.round++;
			this.startPlaying();
			this.broadcastRoom();
		}, ROUND_BREAK_MS);
		this.broadcastRoom();
	}

	/**
	 * Who is cut at the end of a round: the lowest score. On a tie, whoever reached that score
	 * last goes; then whoever used more words; then a coin flip seeded by the match.
	 */
	private lowestScore(alive: readonly Seat[]): Seat {
		const score = (seat: Seat) => seat.game?.score ?? 0;
		const words = (seat: Seat) => seat.game?.wordsPlayed ?? 0;
		const lowest = Math.min(...alive.map(score));
		let tied = alive.filter((seat) => score(seat) === lowest);
		const latest = Math.max(...tied.map((seat) => seat.scoredAt));
		tied = tied.filter((seat) => seat.scoredAt === latest);
		const most = Math.max(...tied.map(words));
		tied = tied.filter((seat) => words(seat) === most);
		if (tied.length === 1) return tied[0];
		return Rng.fromSeed(`${this.matchSeed}-cut-${this.round}`).pick(tied);
	}

	private alive(): Seat[] {
		return this.seats.filter((seat) => !seat.out);
	}

	private applyMove(
		seat: Seat,
		action: GameAction,
	): { ok: true; events: GameEvent[] } | { ok: false; error: MoveError } {
		const game = seat.game;
		if (
			this.phase !== "playing" ||
			!game ||
			seat.out ||
			this.now() >= (this.phaseEndsAt ?? 0)
		) {
			return { ok: false, error: "not-playing" };
		}
		const result = reduce(game, action, this.deps.words);
		if (!result.ok) return { ok: false, error: result.error };
		seat.game = result.state;
		if (result.state.score > game.score) seat.scoredAt = this.now();
		this.broadcastMini(seat);
		this.broadcastRoom();
		if (result.state.status === "over") this.knockOut(seat, "tower");
		return { ok: true, events: [...result.events] };
	}

	/** A player's move. They always get their board back, with the result. */
	move(guestId: string, seq: number, action: GameAction): void {
		const seat = this.seatOfGuest(guestId);
		if (!seat?.game) return;
		const result = this.applyMove(seat, action);
		this.sendBoard(
			seat,
			seq,
			result.ok ? null : result.error,
			result.ok ? result.events : [],
		);
	}

	/** A bot's move. Returns false once the bot is done (match over or knocked out). */
	botMove(seatId: string, action: GameAction): boolean {
		const seat = this.seats.find((s) => s.seatId === seatId);
		if (!seat) return false;
		// Moves made during a Siege break don't count, but the bot keeps going.
		this.applyMove(seat, action);
		return LIVE.includes(this.phase) && !seat.out;
	}

	private markOut(seat: Seat, reason: OutReason): void {
		seat.out = reason;
		seat.outRound = this.mode === "siege" ? this.round : null;
		seat.outOrder = ++this.outCount;
		seat.stopBot?.();
		seat.stopBot = null;
	}

	/** Out mid-match (tower fell, or left). The match ends if that leaves one wizard. */
	private knockOut(seat: Seat, reason: "tower" | "left"): void {
		if (seat.out || !LIVE.includes(this.phase)) return;
		this.markOut(seat, reason);
		if (this.alive().length <= 1)
			this.finish(this.mode === "siege" ? "last-standing" : reason);
		else this.broadcastRoom();
	}

	private finish(reason: EndReason): void {
		if (this.phase === "finished") return;
		if (this.phaseTimer) clearTimeout(this.phaseTimer);
		this.phaseTimer = null;
		for (const seat of this.seats) {
			seat.stopBot?.();
			seat.stopBot = null;
		}
		const score = (seat: Seat) => seat.game?.score ?? 0;
		// Wizards still standing come first (best score first); then the eliminated, the last
		// one out placing highest.
		const ranked = [...this.seats].sort(
			(a, b) =>
				Number(Boolean(a.out)) - Number(Boolean(b.out)) ||
				b.outOrder - a.outOrder ||
				score(b) - score(a) ||
				a.scoredAt - b.scoredAt,
		);
		const [first, second] = ranked;
		const draw =
			reason === "time" &&
			second !== undefined &&
			!second.out &&
			score(first) === score(second) &&
			first.scoredAt === second.scoredAt;
		this.result = {
			winnerSeatId: draw ? null : first.seatId,
			reason,
			standings: ranked.map((seat, i) => ({
				seatId: seat.seatId,
				name: seat.name,
				score: score(seat),
				place: draw && i < 2 ? 1 : i + 1,
				out: seat.out,
				outRound: seat.outRound,
			})),
		};
		this.phase = "finished";
		this.phaseEndsAt = null;
		this.broadcastRoom();
		this.scheduleIdleClose();
		this.deps.onFinished?.(this.summary(this.result));
	}

	private summary(result: MatchResult): MatchSummary {
		return {
			code: this.code,
			mode: this.mode,
			seconds: this.seconds,
			rounds: Math.max(1, this.round),
			reason: result.reason,
			startedAt: this.startedAt,
			endedAt: this.now(),
			players: this.seats.map((seat, i) => {
				const standing = result.standings.find(
					(entry) => entry.seatId === seat.seatId,
				);
				return {
					seat: i,
					guestId: seat.guestId,
					name: seat.name,
					bot: seat.bot,
					score: standing?.score ?? 0,
					place: standing?.place ?? this.seats.length,
					won: result.winnerSeatId === seat.seatId,
					out: seat.out,
					outRound: seat.outRound,
				};
			}),
		};
	}

	close(): void {
		if (this.closed) return;
		// Everyone left mid-match (only AI rivals were still playing): the match ends here, so
		// it still has a result for the players' history.
		if (LIVE.includes(this.phase)) this.finish("left");
		this.closed = true;
		if (this.phaseTimer) clearTimeout(this.phaseTimer);
		this.clearIdle();
		for (const seat of this.seats) {
			if (seat.graceTimer) clearTimeout(seat.graceTimer);
			seat.stopBot?.();
			seat.connection?.send({ type: "left" });
			if (seat.guestId) this.deps.onSeatGone(seat.guestId, this);
		}
		this.seats.length = 0;
		this.deps.onClose(this);
	}

	// --- Idle cleanup --------------------------------------------------------------------

	private clearIdle(): void {
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = null;
	}

	private scheduleIdleClose(): void {
		this.clearIdle();
		const ms = this.phase === "finished" ? FINISHED_CLOSE_MS : IDLE_CLOSE_MS;
		this.idleTimer = setTimeout(() => this.close(), ms);
	}

	/** Something changed in the lobby or on the results screen. */
	private changed(): void {
		if (this.phase === "waiting" || this.phase === "finished")
			this.scheduleIdleClose();
		this.broadcastRoom();
	}

	// --- Messages ------------------------------------------------------------------------

	view(seat: Seat | null): RoomView {
		return {
			code: this.code,
			mode: this.mode,
			phase: this.phase,
			seconds: this.seconds,
			round: this.round,
			phaseEndsAt: this.phaseEndsAt,
			seats: this.seats.map((s) => ({
				seatId: s.seatId,
				name: s.name,
				bot: s.bot,
				host: s.seatId === this.hostSeatId,
				connected: s.bot !== null || s.connection !== null,
				score: s.game?.score ?? 0,
				out: s.out,
				outRound: s.outRound,
			})),
			you: seat?.seatId ?? null,
			cut: this.cut,
			result: this.result,
		};
	}

	private broadcastRoom(): void {
		const serverNow = this.now();
		for (const seat of this.seats) {
			seat.connection?.send({ type: "room", room: this.view(seat), serverNow });
		}
	}

	private sendBoard(
		seat: Seat,
		seq: number | null,
		error: MoveError | null,
		events: readonly GameEvent[],
	): void {
		if (!seat.connection || !seat.game) return;
		seat.connection.send({
			type: "board",
			seq,
			ok: error === null,
			error,
			state: toPublicState(seat.game),
			events,
		});
	}

	private broadcastMini(from: Seat): void {
		if (!from.game) return;
		const mini = encodeMini(from.game.board);
		for (const seat of this.seats) {
			if (seat !== from)
				seat.connection?.send({ type: "opponent", seatId: from.seatId, mini });
		}
	}

	/** Everything a (re)connecting player needs: the room, their board, the others' boards. */
	private sendEverything(seat: Seat): void {
		seat.connection?.send({
			type: "room",
			room: this.view(seat),
			serverNow: this.now(),
		});
		this.sendBoard(seat, null, null, []);
		for (const other of this.seats) {
			if (other !== seat && other.game) {
				seat.connection?.send({
					type: "opponent",
					seatId: other.seatId,
					mini: encodeMini(other.game.board),
				});
			}
		}
	}
}
