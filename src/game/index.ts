export { nearestCurse } from "./board";
export * from "./config";
export { type Candidate, findPath, findWords } from "./finder";
export { areAdjacent, colOf, NEIGHBORS, rowOf, toIndex } from "./hex";
export {
	levelForScore,
	prophecyBonus,
	rankFor,
	scoreForLevel,
} from "./levels";
export { dropInterval } from "./modes/action";
export { checkPath } from "./path";
export { createGame, type NewGameOptions, reduce } from "./reducer";
export {
	decodeMove,
	encodeMove,
	MAX_MOVES,
	type MoveRecord,
	type ReplayResult,
	replayGame,
} from "./replay";
export { GameStateSchema, parseGameState } from "./schema";
export { scoreWord, type WordScore } from "./scoring";
export { crystalSpec } from "./specials";
export type * from "./types";
