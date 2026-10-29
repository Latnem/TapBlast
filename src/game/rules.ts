import { clone, genId, seededShuffle } from '../lib/util';
import type {
  Answer,
  AppSettings,
  PlayerResult,
  PlayerWithId,
  PointsMultiplier,
  Question,
  QuestionType,
  Quiz,
  Room,
  Player,
} from './types';

/* =========================================================
   Kahoot-style rules. Everything here is pure (no Firebase,
   no DOM) so it can be unit-tested and shared by the live
   game and preview mode.
   ========================================================= */

export const COUNTDOWN_MS = 3000;
export const RESULTS_GRACE_MS = 900;
export const MAX_STREAK_BONUS = 500;

export const answerColors = ['blue', 'green', 'orange', 'yellow'] as const;
export const answerShapes = ['A', 'B', 'C', 'D'] as const;

/* ---------- quiz building ---------- */

export function defaultQuestion(settings: Partial<AppSettings> = {}): Question {
  const type: QuestionType = settings.defaultQuestionType || 'quiz';
  const q: Question = {
    id: genId(),
    type,
    text: '',
    seconds: Number(settings.defaultSeconds) || 20,
    media: null,
    answers: [0, 1, 2, 3].map(() => ({ id: genId(), text: '', media: null })),
    correctIndex: 0,
    typeAnswer: '',
  };
  if (type === 'truefalse') q.answers = trueFalseAnswers();
  return q;
}

export function defaultQuiz(settings: Partial<AppSettings> = {}): Quiz {
  return {
    id: genId(),
    title: 'Untitled Quiz',
    folderId: '',
    cover: null,
    shuffleAnswers: false,
    updatedAt: Date.now(),
    questions: [defaultQuestion(settings)],
  };
}

export function trueFalseAnswers(prev: Answer[] = []): Answer[] {
  return [
    { id: prev[0]?.id || genId(), text: 'True', media: null },
    { id: prev[1]?.id || genId(), text: 'False', media: null },
  ];
}

/** Switch a question's type, keeping whatever can be kept. Returns a new question. */
export function withQuestionType(q: Question, type: QuestionType): Question {
  const next = clone(q);
  next.type = type;
  if (type === 'truefalse') {
    next.answers = trueFalseAnswers(next.answers);
    next.correctIndex = Number(next.correctIndex) === 1 ? 1 : 0;
  } else if (type === 'type') {
    next.typeAnswer = next.typeAnswer || '';
  } else {
    next.answers = next.answers || [];
    while (next.answers.length < 4) next.answers.push({ id: genId(), text: '', media: null });
    next.answers = next.answers.slice(0, 4);
    if (typeof next.correctIndex !== 'number') next.correctIndex = 0;
  }
  return next;
}

export function clampSeconds(v: unknown, fallback = 20): number {
  return Math.max(5, Math.min(120, Number(v) || fallback));
}

export function normalizeImportedQuiz(raw: unknown, settings: Partial<AppSettings> = {}): Quiz {
  const copy = clone((raw || {}) as Partial<Quiz>) as Quiz;
  copy.id = genId();
  copy.title = String(copy.title || 'Imported Quiz').trim() || 'Imported Quiz';
  copy.folderId = '';
  copy.updatedAt = Date.now();
  copy.cover = copy.cover || null;
  copy.shuffleAnswers = !!copy.shuffleAnswers;
  const questions: Partial<Question>[] =
    Array.isArray(copy.questions) && copy.questions.length ? copy.questions : [defaultQuestion(settings)];
  copy.questions = questions.map((question) => {
    const nq = clone(question || {}) as Question;
    nq.id = genId();
    nq.type = nq.type || 'quiz';
    nq.text = nq.text || '';
    nq.seconds = clampSeconds(nq.seconds, Number(settings.defaultSeconds) || 20);
    nq.media = nq.media || null;
    nq.correctIndex = Number.isFinite(Number(nq.correctIndex)) ? Number(nq.correctIndex) : 0;
    nq.typeAnswer = nq.typeAnswer || '';
    const answers: Partial<Answer>[] = Array.isArray(nq.answers) ? nq.answers : [];
    nq.answers = answers.slice(0, 4).map((a) => ({ id: genId(), text: a?.text || '', media: a?.media || null }));
    while (nq.answers.length < 4) nq.answers.push({ id: genId(), text: '', media: null });
    return nq;
  });
  return copy;
}

export function questionTypeLabel(q: Pick<Question, 'type'>): string {
  if (q.type === 'truefalse') return 'TRUE/FALSE';
  if (q.type === 'type') return 'TYPE';
  return 'QUIZ';
}

/* ---------- answers ---------- */

export type DisplayAnswer = Answer & { index: number };

export function nonBlankAnswers(q: Question): DisplayAnswer[] {
  return (q.answers || [])
    .map((a, i) => ({ ...a, index: i }))
    .filter((a) => (a.text || '').trim() || a.media);
}

/** Answer order shown on BOTH host and player screens (seeded, so they always match). */
export function displayAnswersFor(room: Pick<Room, 'code' | 'currentQ'> | null, quiz: Quiz, q: Question): DisplayAnswer[] {
  const answers = nonBlankAnswers(q);
  if (!quiz.shuffleAnswers || q.type === 'truefalse') return answers;
  const seed = (room?.code || quiz.id || 'quiz') + '|' + (room?.currentQ ?? 0) + '|' + (q.id || 'q');
  return seededShuffle(answers, seed);
}

export const normalizeTypedAnswer = (v: unknown): string => String(v || '').trim().toLowerCase();

export function isTypeAnswerCorrect(q: Question, value: unknown): boolean {
  const accepted = String(q.typeAnswer || '')
    .split('|')
    .map(normalizeTypedAnswer)
    .filter(Boolean);
  return accepted.includes(normalizeTypedAnswer(value));
}

export function playerAnsweredCurrent(p: Player, room: Pick<Room, 'currentQ'>): boolean {
  return (
    p.answerQ === room.currentQ &&
    (typeof p.currentAnswerIndex === 'number' || typeof p.currentTypedAnswer === 'string')
  );
}

export function playerCorrectForQuestion(p: Player, q: Question, room: Pick<Room, 'currentQ'>): boolean {
  if (!playerAnsweredCurrent(p, room)) return false;
  if (q.type === 'type') return isTypeAnswerCorrect(q, p.currentTypedAnswer);
  return p.currentAnswerIndex === q.correctIndex;
}

/* ---------- players / ranking ---------- */

export function rankPlayers<T extends { score?: number; joinedAt?: number }>(list: T[]): T[] {
  return list
    .slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0) || (a.joinedAt || 0) - (b.joinedAt || 0));
}

export function sortedPlayers(room: Pick<Room, 'players'> | null): PlayerWithId[] {
  return rankPlayers(Object.entries(room?.players || {}).map(([id, p]) => ({ id, ...p })));
}

export function everyoneAnswered(room: Room): boolean {
  const players = sortedPlayers(room);
  return players.length > 0 && players.every((p) => playerAnsweredCurrent(p, room));
}

export function isLastQuestion(room: Pick<Room, 'currentQ' | 'quiz'>): boolean {
  return (room.currentQ || 0) + 1 >= (room.quiz?.questions || []).length;
}

/* ---------- scoring ---------- */

export function pointsMultiplier(q: Pick<Question, 'pointsMultiplier'> | null | undefined): PointsMultiplier {
  const m = Number(q?.pointsMultiplier);
  return m === 0 || m === 2 ? m : 1;
}

export function questionDurationMs(room: Room, q: Question): number {
  return Math.max(1000, Number(room.currentQuestionDurationMs || (q.seconds || 20) * 1000));
}

/**
 * Time the player took to answer, excluding time the host had the game paused.
 * answerAt, currentQuestionStartedAt and pause windows are all server timestamps,
 * so phone/laptop clock differences do not matter.
 */
export function answerElapsedMs(room: Room, player: Player, q: Question): number {
  const totalMs = questionDurationMs(room, q);
  let startedAt = Number(room.currentQuestionStartedAt || 0);
  if (!startedAt && room.currentQuestionEndsAt) startedAt = Number(room.currentQuestionEndsAt) - totalMs;
  const answeredAt = Number(player.answerAt || 0);
  if (!startedAt || !answeredAt) return totalMs;
  let pausedMs = 0;
  Object.values(room.pauseWindows || {}).forEach((w) => {
    const from = Number(w?.from || 0);
    if (!from || from >= answeredAt) return;
    const to = Math.min(answeredAt, Number(w.to || answeredAt));
    pausedMs += Math.max(0, to - Math.max(from, startedAt));
  });
  return Math.max(0, Math.min(totalMs, answeredAt - startedAt - pausedMs));
}

/**
 * Kahoot formula: points = round((1 - (responseTime / questionTimer) / 2) * 1000).
 * Correct answers earn 500-1000 (x2 for double points, 0 for no points). Wrong = 0.
 */
export function scoreFor(room: Room, player: Player, q: Question): number {
  if (!playerCorrectForQuestion(player, q, room)) return 0;
  const mult = pointsMultiplier(q);
  if (!mult) return 0;
  const totalMs = questionDurationMs(room, q);
  const elapsedMs = answerElapsedMs(room, player, q);
  const base = elapsedMs <= 500 ? 1000 : Math.round((1 - elapsedMs / totalMs / 2) * 1000);
  return Math.max(500, Math.min(1000, base)) * mult;
}

/** Kahoot answer streak bonus: +100 per consecutive correct answer after the first, max +500. */
export function streakBonusFor(streak: number, q: Question): number {
  if (streak < 2 || !pointsMultiplier(q)) return 0;
  return Math.min(MAX_STREAK_BONUS, (streak - 1) * 100);
}

export function streakMessage(streak: number, rand: () => number = Math.random): string {
  const pick = (arr: string[]) => arr[Math.floor(rand() * arr.length)];
  if (streak >= 5) return pick(['🔥 On fire!', '🔥 Unstoppable!', '🔥 Five in a row!']);
  if (streak === 4) return pick(['Hot streak!', 'Keep it up!']);
  if (streak === 3) return pick(['Answer streak!', 'Rolling!']);
  if (streak === 2) return pick(['Nice!', 'Good streak!']);
  return '';
}

/** Works out every player's result for the current question: {playerId: fields to write}. */
export function computeQuestionResults(room: Room): Record<string, PlayerResult> {
  const q = room.quiz.questions[room.currentQ];
  const players = Object.entries(room.players || {}).map(([id, p]) => ({ id, ...p }));
  const prevRank: Record<string, number> = {};
  rankPlayers(players).forEach((p, i) => {
    prevRank[p.id] = i + 1;
  });
  const results: Record<string, PlayerResult> = {};
  players.forEach((p) => {
    const answered = playerAnsweredCurrent(p, room);
    const correct = playerCorrectForQuestion(p, q, room);
    const streak = correct ? (p.streak || 0) + 1 : 0;
    const bonus = correct ? streakBonusFor(streak, q) : 0;
    const delta = scoreFor(room, p, q) + bonus;
    results[p.id] = {
      lastAnswered: answered,
      lastCorrect: correct,
      lastDelta: delta,
      lastBonus: bonus,
      lastAnswerMs: answered ? answerElapsedMs(room, p, q) : 0,
      score: (p.score || 0) + delta,
      streak,
      streakMsg: streakMessage(streak),
      prevRank: (room.currentQ || 0) > 0 ? prevRank[p.id] : null,
      rank: 0,
      behindName: '',
      behindBy: 0,
    };
  });
  const ranked = rankPlayers(
    players.map((p) => ({ id: p.id, name: p.name, joinedAt: p.joinedAt, score: results[p.id].score })),
  );
  ranked.forEach((p, i) => {
    const ahead = ranked[i - 1];
    results[p.id].rank = i + 1;
    results[p.id].behindName = ahead ? ahead.name || 'Player' : '';
    results[p.id].behindBy = ahead ? Math.max(0, (ahead.score || 0) - (p.score || 0)) : 0;
  });
  return results;
}

/** Flattens per-player results into a multi-path update ({'players/id/field': value}). */
export function resultsToUpdates(results: Record<string, PlayerResult>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  Object.entries(results).forEach(([pid, r]) => {
    Object.entries(r).forEach(([k, v]) => {
      updates[`players/${pid}/${k}`] = v;
    });
  });
  return updates;
}

/** Multi-path update that moves the room to the next question's countdown. */
export function nextQuestionUpdates(room: Room, now = Date.now()): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    currentQ: (room.currentQ || 0) + 1,
    phase: 'countdown',
    countdownEndsAt: now + COUNTDOWN_MS,
    paused: false,
    currentRemainingMs: 0,
    currentQuestionStartedAt: 0,
    currentQuestionEndsAt: 0,
    pauseWindows: null,
    activePauseId: null,
    updatedAt: now,
  };
  Object.keys(room.players || {}).forEach((pid) => {
    updates[`players/${pid}/currentAnswerIndex`] = null;
    updates[`players/${pid}/currentTypedAnswer`] = null;
    updates[`players/${pid}/answerAt`] = 0;
    updates[`players/${pid}/answerQ`] = -1;
    updates[`players/${pid}/lastDelta`] = 0;
    updates[`players/${pid}/lastBonus`] = 0;
    updates[`players/${pid}/lastCorrect`] = false;
    updates[`players/${pid}/lastAnswered`] = false;
    updates[`players/${pid}/streakMsg`] = '';
  });
  return updates;
}

export function studentRankLine(player: Player | null | undefined, ordinalFn: (n: number) => string): string {
  if (!player?.rank) return '';
  if (player.rank === 1) return "You're in 1st place!";
  return (
    `You're in ${ordinalFn(player.rank)} place` +
    (player.behindName ? `, ${Number(player.behindBy || 0)} pts behind ${player.behindName}` : '')
  );
}
