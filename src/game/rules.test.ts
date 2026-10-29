import { describe, expect, it } from 'vitest';
import {
  answerElapsedMs,
  computeQuestionResults,
  displayAnswersFor,
  isTypeAnswerCorrect,
  nextQuestionUpdates,
  scoreFor,
  streakBonusFor,
} from './rules';
import type { Player, Question, Quiz, Room } from './types';

const START = 1_000_000;

function question(over: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    type: 'quiz',
    text: '2+2?',
    seconds: 20,
    media: null,
    answers: ['3', '4', '5', '6'].map((t, i) => ({ id: 'a' + i, text: t, media: null })),
    correctIndex: 1,
    typeAnswer: '',
    ...over,
  };
}

function room(players: Record<string, Partial<Player>>, over: Partial<Room> = {}, q = question()): Room {
  const quiz: Quiz = { id: 'z', title: 'T', folderId: '', cover: null, shuffleAnswers: false, updatedAt: 0, questions: [q, question({ id: 'q2' })] };
  const full: Record<string, Player> = {};
  Object.entries(players).forEach(([id, p], i) => {
    full[id] = { name: id, joinedAt: i, score: 0, streak: 0, ...p };
  });
  return {
    code: '123456',
    hostUid: 'h',
    hostName: 'H',
    quiz,
    currentQ: 0,
    phase: 'locked',
    currentQuestionStartedAt: START,
    currentQuestionDurationMs: 20000,
    players: full,
    updatedAt: 0,
    ...over,
  };
}

const answered = (at: number, index = 1): Partial<Player> => ({ answerQ: 0, currentAnswerIndex: index, answerAt: START + at });

describe('scoreFor (Kahoot formula)', () => {
  it('gives 1000 for an instant correct answer', () => {
    const r = room({ a: answered(200) });
    expect(scoreFor(r, r.players!.a, r.quiz.questions[0])).toBe(1000);
  });

  it('gives 750 at half time and 500 at the buzzer', () => {
    const r = room({ half: answered(10000), end: answered(20000), late: answered(25000) });
    const q = r.quiz.questions[0];
    expect(scoreFor(r, r.players!.half, q)).toBe(750);
    expect(scoreFor(r, r.players!.end, q)).toBe(500);
    expect(scoreFor(r, r.players!.late, q)).toBe(500);
  });

  it('gives 0 for wrong answers and for answers to a previous question', () => {
    const r = room({ wrong: answered(1000, 0), stale: { ...answered(1000), answerQ: -1 } });
    const q = r.quiz.questions[0];
    expect(scoreFor(r, r.players!.wrong, q)).toBe(0);
    expect(scoreFor(r, r.players!.stale, q)).toBe(0);
  });

  it('doubles for double points and zeroes for no points', () => {
    const dbl = room({ a: answered(10000) }, {}, question({ pointsMultiplier: 2 }));
    expect(scoreFor(dbl, dbl.players!.a, dbl.quiz.questions[0])).toBe(1500);
    const none = room({ a: answered(10000) }, {}, question({ pointsMultiplier: 0 }));
    expect(scoreFor(none, none.players!.a, none.quiz.questions[0])).toBe(0);
  });
});

describe('answerElapsedMs', () => {
  it('excludes time the host had the game paused before the answer', () => {
    const r = room(
      { a: answered(12000) },
      { pauseWindows: { p1: { from: START + 2000, to: START + 9000 }, p2: { from: START + 15000 } } },
    );
    expect(answerElapsedMs(r, r.players!.a, r.quiz.questions[0])).toBe(5000);
  });
});

describe('streak bonus', () => {
  it('is +100 per streak step after the first, capped at +500', () => {
    const q = question();
    expect([1, 2, 3, 6, 10].map((s) => streakBonusFor(s, q))).toEqual([0, 100, 200, 500, 500]);
    expect(streakBonusFor(4, question({ pointsMultiplier: 0 }))).toBe(0);
  });
});

describe('computeQuestionResults', () => {
  it('awards points, streaks, ranks and gap to the player ahead', () => {
    const r = room(
      {
        ann: { ...answered(0), score: 1000, streak: 1 },
        bob: { ...answered(10000, 0), score: 900, streak: 3 },
        cat: { score: 0 },
      },
      { currentQ: 0 },
    );
    const res = computeQuestionResults(r);
    expect(res.ann).toMatchObject({ lastCorrect: true, lastDelta: 1100, lastBonus: 100, score: 2100, streak: 2, rank: 1, behindName: '' });
    expect(res.bob).toMatchObject({ lastCorrect: false, lastAnswered: true, lastDelta: 0, score: 900, streak: 0, rank: 2, behindName: 'ann', behindBy: 1200 });
    expect(res.cat).toMatchObject({ lastAnswered: false, lastDelta: 0, rank: 3, behindBy: 900 });
    expect(res.ann.prevRank).toBeNull();
  });
});

describe('typed answers', () => {
  it('accept any |-separated answer, ignoring case and spaces', () => {
    const q = question({ type: 'type', typeAnswer: 'USA|United States' });
    expect(isTypeAnswerCorrect(q, '  united states ')).toBe(true);
    expect(isTypeAnswerCorrect(q, 'usa')).toBe(true);
    expect(isTypeAnswerCorrect(q, 'Canada')).toBe(false);
  });
});

describe('displayAnswersFor', () => {
  it('shuffles the same way for every screen in the same room', () => {
    const r = room({});
    r.quiz.shuffleAnswers = true;
    const a = displayAnswersFor(r, r.quiz, r.quiz.questions[0]).map((x) => x.index);
    const b = displayAnswersFor({ code: r.code, currentQ: 0 }, r.quiz, r.quiz.questions[0]).map((x) => x.index);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('nextQuestionUpdates', () => {
  it('advances the question and clears every answer', () => {
    const r = room({ ann: answered(0) });
    const u = nextQuestionUpdates(r, 5000);
    expect(u).toMatchObject({ currentQ: 1, phase: 'countdown', countdownEndsAt: 8000, 'players/ann/answerQ': -1, 'players/ann/currentTypedAnswer': null });
  });
});
