// One Duel room: seats, the waiting → countdown → playing → finished cycle, and the referee.
// The server owns every board; players only send the stones they picked.
import { createGame, reduce } from "../../game/reducer";
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
	type MatchResult,
	type MoveError,
	type OutReason,
	RECONNECT_GRACE_MS,
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
}

export type RoomError = Extract<
	ErrorCode,
	| "room-full"
	| "match-running"
	| "not-host"
	| "need-two-players"
	| "not-in-room"
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
	graceTimer: Timer | null;
	stopBot: (() => void) | null;
}

const DUEL_SEATS = 2;
/** Rooms nobody is using close after this long in the lobby or on the results screen. */
const IDLE_CLOSE_MS = 10 * 60_000;
const FINISHED_CLOSE_MS = 2 * 60_000;

export class Room implements BotHost {
	phase: RoomPhase = "waiting";
	durationSec: number;
	phaseEndsAt: number | null = null;
	result: MatchResult | null = null;
	closed = false;
	private readonly seats: Seat[] = [];
	private hostSeatId: string | null = null;
	private phaseTimer: Timer | null = null;
	private idleTimer: Timer | null = null;

	constructor(
		readonly code: string,
		durationSec: number,
		private readonly deps: RoomDeps,
	) {
		this.durationSec = durationSec;
		this.scheduleIdleClose();
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
		if (this.seats.length >= DUEL_SEATS) return "room-full";
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
		if (this.phase === "countdown" || this.phase === "playing") {
			if (this.phase === "countdown") this.cancelCountdown();
			else this.knockOut(seat, "left");
		}
		if (this.phase !== "finished" || !this.seats.some((s) => s.connection)) {
			this.removeSeat(seat);
		}
	}

	leave(guestId: string): void {
		const seat = this.seatOfGuest(guestId);
		if (!seat) return;
		seat.connection?.send({ type: "left" });
		seat.connection = null;
		if (seat.graceTimer) clearTimeout(seat.graceTimer);
		if (this.phase === "countdown") this.cancelCountdown();
		if (this.phase === "playing") {
			// Forfeit: the seat stays on the results, but the guest is free to go elsewhere.
			this.knockOut(seat, "left");
			this.deps.onSeatGone(guestId, this);
			if (!this.seats.some((s) => s.connection)) this.close();
			return;
		}
		this.removeSeat(seat);
	}

	addBot(guestId: string, difficulty: BotDifficulty): RoomError | null {
		const error = this.hostCheck(guestId);
		if (error) return error;
		if (this.seats.length >= DUEL_SEATS) return "room-full";
		this.addSeat({
			guestId: null,
			name: BOT_NAMES[difficulty],
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

	setDuration(guestId: string, durationSec: number): RoomError | null {
		const error = this.hostCheck(guestId);
		if (error) return error;
		this.durationSec = durationSec;
		this.changed();
		return null;
	}

	start(guestId: string): RoomError | null {
		const error = this.hostCheck(guestId);
		if (error) return error;
		if (this.seats.length < DUEL_SEATS) return "need-two-players";
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
		}
		this.phase = "waiting";
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
		const matchSeed = this.deps.randomId();
		const start = this.now();
		const newGame =
			this.deps.newGame ??
			((seed: string) => createGame({ mode: "classic", seed }));
		this.seats.forEach((seat, i) => {
			// Every seat gets its own stones; the seed never leaves the server.
			seat.game = newGame(`${matchSeed}-${i}`, i);
			seat.scoredAt = start;
			seat.out = null;
		});
		this.phase = "playing";
		this.phaseEndsAt = start + this.durationSec * 1000;
		this.phaseTimer = setTimeout(
			() => this.finish("time"),
			this.durationSec * 1000,
		);
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

	botMove(seatId: string, action: GameAction): boolean {
		const seat = this.seats.find((s) => s.seatId === seatId);
		if (!seat) return false;
		this.applyMove(seat, action);
		return this.phase === "playing" && !seat.out;
	}

	private knockOut(seat: Seat, reason: OutReason): void {
		if (seat.out || this.phase !== "playing") return;
		seat.out = reason;
		seat.stopBot?.();
		const alive = this.seats.filter((s) => !s.out);
		if (alive.length <= 1) this.finish(reason);
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
		const ranked = [...this.seats].sort(
			(a, b) =>
				Number(Boolean(a.out)) - Number(Boolean(b.out)) ||
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
				place: draw ? 1 : i + 1,
			})),
		};
		this.phase = "finished";
		this.phaseEndsAt = null;
		this.broadcastRoom();
		this.scheduleIdleClose();
	}

	close(): void {
		if (this.closed) return;
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
			mode: "duel",
			phase: this.phase,
			durationSec: this.durationSec,
			phaseEndsAt: this.phaseEndsAt,
			seats: this.seats.map((s) => ({
				seatId: s.seatId,
				name: s.name,
				bot: s.bot,
				host: s.seatId === this.hostSeatId,
				connected: s.bot !== null || s.connection !== null,
				score: s.game?.score ?? 0,
				out: s.out,
			})),
			you: seat?.seatId ?? null,
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
