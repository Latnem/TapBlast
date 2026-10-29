import { describe, expect, it } from 'vitest';
import { HostController } from './hostController';
import { LocalRoomStore, applyUpdates } from './roomStore';
import type { Question, Room } from './types';

const q = (id: string): Question => ({
  id,
  type: 'quiz',
  text: id,
  seconds: 10,
  media: null,
  answers: ['a', 'b'].map((t, i) => ({ id: t + i, text: t, media: null })),
  correctIndex: 0,
  typeAnswer: '',
});

function setup() {
  const room: Room = {
    code: 'PREVIEW',
    hostUid: 'h',
    hostName: 'H',
    quiz: { id: 'z', title: 'T', folderId: '', cover: null, shuffleAnswers: false, updatedAt: 0, questions: [q('q1'), q('q2')] },
    currentQ: 0,
    phase: 'lobby',
    players: { ann: { name: 'Ann', joinedAt: 1, score: 0, streak: 0 }, bob: { name: 'Bob', joinedAt: 2, score: 0, streak: 0 } },
    updatedAt: 0,
  };
  const store = new LocalRoomStore(room);
  return { store, host: new HostController(store) };
}

async function answer(store: LocalRoomStore, pid: string, index: number) {
  const r = (await store.read())!;
  await store.update({ [`players/${pid}/currentAnswerIndex`]: index, [`players/${pid}/answerQ`]: r.currentQ, [`players/${pid}/answerAt`]: Number(r.currentQuestionStartedAt) + 1000 });
}

describe('HostController', () => {
  it('runs a whole game and never scores a question twice', async () => {
    const { store, host } = setup();
    await host.startQuiz();
    await host.finishCountdown((await store.read())!);
    expect((await store.read())!.phase).toBe('question_answers');

    await answer(store, 'ann', 0);
    await answer(store, 'bob', 1);
    await host.lockQuestion((await store.read())!);
    await Promise.all([host.showResults(), host.showResults()]);
    let r = (await store.read())!;
    expect(r.phase).toBe('answer_results');
    expect(r.players!.ann.score).toBe(950);
    expect(r.players!.bob.score).toBe(0);

    await host.next();
    expect((await store.read())!.phase).toBe('leaderboard');
    await host.next();
    r = (await store.read())!;
    expect(r).toMatchObject({ phase: 'countdown', currentQ: 1 });
    expect(r.players!.ann.answerQ).toBe(-1);

    await host.finishCountdown(r);
    await answer(store, 'ann', 0);
    await host.lockQuestion((await store.read())!);
    await host.showResults();
    r = (await store.read())!;
    expect(r.players!.ann).toMatchObject({ score: 950 + 950 + 100, streak: 2, lastBonus: 100 });

    await host.next();
    expect((await store.read())!.phase).toBe('final');
  });

  it('pausing does not reduce points', async () => {
    const { store, host } = setup();
    await host.startQuiz();
    await host.finishCountdown((await store.read())!);
    const start = Number((await store.read())!.currentQuestionStartedAt);
    await store.update({ pauseWindows: { p: { from: start + 500, to: start + 8500 } } });
    await store.update({ 'players/ann/currentAnswerIndex': 0, 'players/ann/answerQ': 0, 'players/ann/answerAt': start + 9500 });
    await host.lockQuestion((await store.read())!);
    await host.showResults();
    expect((await store.read())!.players!.ann.score).toBe(925);
  });
});

describe('applyUpdates', () => {
  it('sets nested paths and deletes nulls', () => {
    expect(applyUpdates({ a: { b: 1, c: 2 } }, { 'a/b': null, 'a/d/e': 3 })).toEqual({ a: { c: 2, d: { e: 3 } } });
  });
});
