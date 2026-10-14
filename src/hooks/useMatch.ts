import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
	lineForMove,
	lineForRejection,
	type NoxLine,
} from "#/components/game/nox-lines";
import { type Board, checkPath, type GameEvent } from "#/game";
import type { Dictionary } from "#/game/dictionary";
import type { Profile } from "#/lib/profile";
import { playSound } from "#/lib/sound";
import {
	type BotDifficulty,
	decodeMini,
	type ErrorCode,
	type MatchMode,
	type MoveError,
	type PublicGameState,
	type RoomView,
	type ServerMessage,
} from "#/shared/protocol";
import { useMatchSocket } from "./useMatchSocket";
import { useMoveFeedback } from "./useMoveFeedback";
import { useWordSelection } from "./useWordSelection";

/** Errors that mean this page can't show the room at all. */
const FATAL: readonly ErrorCode[] = [
	"room-not-found",
	"room-full",
	"match-running",
	"name-not-allowed",
	"old-version",
	"server-busy",
	"too-many-connections",
];

/** How long to wait for the server to answer a move before giving up on it. */
const REPLY_TIMEOUT_MS = 5000;

type BoardMessage = Extract<ServerMessage, { type: "board" }>;

interface PendingCast {
	readonly seq: number;
	animated: boolean;
	reply: BoardMessage | null;
}

export interface NewRoom {
	readonly mode: MatchMode;
	readonly seconds: number;
	/** Fill the other seats with AI rivals and start at once. */
	readonly ai?: { readonly difficulty: BotDifficulty; readonly count: number };
}

const OPENING_LINES: Record<MatchMode, NoxLine> = {
	duel: {
		mood: "idle",
		text: "Spell faster than your rival. Highest score when the clock runs out wins.",
	},
	siege: {
		mood: "idle",
		text: "Keep off the bottom of the scoreboard: the lowest score is cut at the end of each round.",
	},
};

function moveErrorLine(error: MoveError, word: string): NoxLine {
	return error === "not-playing"
		? { mood: "idle", text: "Time was up; that word didn't count." }
		: lineForRejection(error, word);
}

/**
 * One Duel or Siege from this player's side: the room, our board (the server's copy), the
 * rivals' boards, and our moves. Our cast animates straight away; the server's answer
 * settles it.
 */
export function useMatch({
	code,
	create,
	profile,
	dictionary,
	onRoomCreated,
}: {
	/** The room code, or null to create a room. */
	code: string | null;
	create: NewRoom | null;
	profile: Profile;
	dictionary: Dictionary;
	onRoomCreated: (code: string) => void;
}) {
	const [room, setRoom] = useState<RoomView | null>(null);
	const [mine, setMineState] = useState<PublicGameState | null>(null);
	const mineRef = useRef<PublicGameState | null>(null);
	const [opponents, setOpponents] = useState<Readonly<Record<string, Board>>>(
		{},
	);
	const [problem, setProblem] = useState<{
		code: ErrorCode;
		message: string;
	} | null>(null);
	const [left, setLeft] = useState(false);
	const [casting, setCasting] = useState<readonly number[] | null>(null);
	const pending = useRef<PendingCast | null>(null);
	const pendingShuffle = useRef<number | null>(null);
	const seq = useRef(0);
	const roomCode = useRef(code);
	const [shuffleKey, setShuffleKey] = useState(0);
	const [nox, setNox] = useState<NoxLine>(
		OPENING_LINES[create?.mode ?? "duel"],
	);
	const feedback = useMoveFeedback();

	const me = room?.seats.find((seat) => seat.seatId === room.you) ?? null;
	const locked =
		casting !== null ||
		room?.phase !== "playing" ||
		mine?.status !== "playing" ||
		Boolean(me?.out);

	function setMine(next: PublicGameState | null) {
		mineRef.current = next;
		setMineState(next);
	}

	const words = useWordSelection({
		board: mine?.board ?? [],
		getBoard: () => mineRef.current?.board ?? [],
		dictionary,
		locked,
		onCast: cast,
		onTypeMiss: (key) =>
			setNox({
				mood: "idle",
				text: `No “${key.toUpperCase()}” touches the end of your word.`,
			}),
	});

	function announce(events: readonly GameEvent[], state: PublicGameState) {
		setNox(lineForMove(events, state));
		feedback.show(events);
	}

	function cast(path: readonly number[], fromDrag: boolean) {
		const state = mineRef.current;
		if (!state) return;
		// Check locally first, so a typo never costs a round trip.
		const check = checkPath(state.board, path, dictionary);
		if (!check.ok) {
			words.shake();
			setNox(lineForRejection(check.error, words.wordOf(path)));
			if (fromDrag) words.clear();
			return;
		}
		const next = ++seq.current;
		pending.current = { seq: next, animated: false, reply: null };
		socket.send({ type: "play", seq: next, path: [...path] });
		playSound("cast", words.wordOf(path).length);
		setCasting(path);
		setTimeout(() => {
			if (pending.current?.seq === next) settle();
		}, REPLY_TIMEOUT_MS);
	}

	/** The board finished the cast animation. */
	function finishCast() {
		const current = pending.current;
		if (!current) return;
		current.animated = true;
		if (current.reply) settle();
	}

	/** Both the animation and the server's answer are in: show the result. */
	function settle() {
		const current = pending.current;
		pending.current = null;
		setCasting(null);
		const reply = current?.reply;
		if (!reply) {
			// No answer (connection trouble): the stones come back; the reconnect resends the board.
			words.shake();
			return;
		}
		setMine(reply.state);
		if (reply.ok) {
			words.clear();
			announce(reply.events, reply.state);
		} else if (reply.error) {
			words.shake();
			setNox(moveErrorLine(reply.error, words.word));
		}
	}

	function shuffle() {
		if (locked) return;
		const next = ++seq.current;
		pendingShuffle.current = next;
		socket.send({ type: "shuffle", seq: next });
	}

	const onMessage = (message: ServerMessage) => {
		switch (message.type) {
			case "welcome":
				if (roomCode.current)
					socket.send({ type: "joinRoom", code: roomCode.current });
				else if (create) socket.send({ type: "createRoom", ...create });
				return;
			case "room":
				if (!roomCode.current) {
					roomCode.current = message.room.code;
					onRoomCreated(message.room.code);
				}
				setRoom(message.room);
				if (message.room.phase === "countdown")
					setNox(OPENING_LINES[message.room.mode]);
				return;
			case "board": {
				const current = pending.current;
				if (current && message.seq === current.seq) {
					current.reply = message;
					if (current.animated) settle();
					return;
				}
				if (message.seq !== null && message.seq === pendingShuffle.current) {
					pendingShuffle.current = null;
					setMine(message.state);
					words.clear();
					if (message.ok) {
						setShuffleKey((key) => key + 1);
						announce(message.events, message.state);
					}
					return;
				}
				if (message.seq === null) {
					// A fresh board: the match started, or we reconnected.
					if (current) {
						pending.current = null;
						setCasting(null);
					}
					setMine(message.state);
					words.clear();
				}
				return;
			}
			case "opponent":
				setOpponents((all) => ({
					...all,
					[message.seatId]: decodeMini(message.mini),
				}));
				return;
			case "error":
				// Before there's a room, any refusal (such as opening rooms too fast) ends the page.
				if (FATAL.includes(message.code) || !room) setProblem(message);
				else setNox({ mood: "worried", text: message.message });
				return;
			case "left":
				setLeft(true);
				return;
		}
	};

	const socket = useMatchSocket(profile, onMessage);

	// A new match (or a rematch) starts with fresh opponent boards.
	const phase = room?.phase;
	const resetForMatch = useEffectEvent((next: typeof phase) => {
		if (next === "waiting") {
			setOpponents({});
			setMine(null);
		}
	});
	useEffect(() => resetForMatch(phase), [phase]);

	return {
		status: socket.status,
		serverNow: socket.serverNow,
		room,
		me,
		mine,
		opponents,
		problem,
		left,
		casting,
		locked,
		shuffleKey,
		nox,
		popups: feedback.popups,
		banner: feedback.banner,
		glow: feedback.glow,
		selection: words.selection,
		word: words.word,
		wordStatus: words.status,
		preview: words.preview,
		rejectKey: words.rejectKey,
		press: words.press,
		drag: words.drag,
		release: words.release,
		cancelGesture: words.cancelGesture,
		cast: words.cast,
		clear: words.clear,
		finishCast,
		shuffle,
		start: () => socket.send({ type: "start" }),
		addBot: (difficulty: BotDifficulty) =>
			socket.send({ type: "addBot", difficulty }),
		removeBot: (seatId: string) => socket.send({ type: "removeSeat", seatId }),
		setSeconds: (seconds: number) =>
			socket.send({ type: "setSeconds", seconds }),
		rematch: () => socket.send({ type: "rematch" }),
		leave: () => socket.send({ type: "leaveRoom" }),
	};
}
