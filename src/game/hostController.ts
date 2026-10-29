import {
  COUNTDOWN_MS,
  computeQuestionResults,
  isLastQuestion,
  nextQuestionUpdates,
  resultsToUpdates,
} from './rules';
import type { RoomStore } from './roomStore';
import type { Room } from './types';

/**
 * Game flow (Kahoot-style):
 *   lobby -> countdown -> [question_media] -> question_answers
 *         -> locked -> answer_results -> leaderboard -> countdown ...
 *         -> final (after the last question's results)
 *
 * Every transition re-checks the current phase so double clicks, two host
 * tabs or overlapping timers can't skip a step or score a question twice.
 */
export class HostController {
  private advanceKey = '';
  private lockKey = '';

  constructor(readonly store: RoomStore) {}

  async startQuiz(): Promise<void> {
    const room = await this.store.read();
    if (!room || room.phase !== 'lobby') return;
    await this.store.update({ phase: 'countdown', countdownEndsAt: Date.now() + COUNTDOWN_MS, updatedAt: Date.now() });
  }

  /** Called when the 3-2-1 countdown reaches zero. */
  async finishCountdown(room: Room): Promise<void> {
    const key = `${room.code}|${room.currentQ}|${room.countdownEndsAt || 0}`;
    if (this.advanceKey === key) return;
    this.advanceKey = key;
    const current = await this.store.read();
    if (!current || current.phase !== 'countdown' || current.currentQ !== room.currentQ) return;
    const q = current.quiz.questions[current.currentQ];
    if (q?.media?.type === 'video') await this.store.update({ phase: 'question_media', updatedAt: Date.now() });
    else await this.beginAnswerPhase(current);
  }

  async beginAnswerPhase(room: Room): Promise<void> {
    const q = room.quiz.questions[room.currentQ];
    const now = Date.now();
    const durationMs = (q.seconds || 20) * 1000;
    await this.store.update({
      phase: 'question_answers',
      paused: false,
      currentRemainingMs: 0,
      currentQuestionStartedAt: this.store.timestamp(),
      currentQuestionDurationMs: durationMs,
      currentQuestionEndsAt: now + durationMs,
      pauseWindows: null,
      activePauseId: null,
      updatedAt: now,
    });
  }

  /** Video finished playing: show the answers. */
  async videoEnded(): Promise<void> {
    const current = await this.store.read();
    if (current?.phase === 'question_media') await this.beginAnswerPhase(current);
  }

  /** Time ran out, everyone answered, or the host pressed Skip. */
  async lockQuestion(room: Room): Promise<void> {
    const key = `${room.code}|${room.currentQ}|${room.currentQuestionStartedAt || 0}`;
    if (this.lockKey === key) return;
    this.lockKey = key;
    const updates: Record<string, unknown> = {
      phase: 'locked',
      paused: false,
      currentRemainingMs: 0,
      activePauseId: null,
      updatedAt: Date.now(),
    };
    if (room.activePauseId) updates[`pauseWindows/${room.activePauseId}/to`] = this.store.timestamp();
    await this.store.update(updates);
  }

  async skip(room: Room): Promise<void> {
    if (room.phase === 'question_media') return this.videoEnded();
    if (room.phase === 'question_answers' || room.phase === 'paused') return this.lockQuestion(room);
  }

  async pause(room: Room): Promise<void> {
    if (room.phase !== 'question_answers') return;
    const pauseId = this.store.newId();
    await this.store.update({
      phase: 'paused',
      paused: true,
      currentRemainingMs: Math.max(0, (room.currentQuestionEndsAt || 0) - Date.now()),
      activePauseId: pauseId,
      [`pauseWindows/${pauseId}/from`]: this.store.timestamp(),
      updatedAt: Date.now(),
    });
  }

  async resume(room: Room): Promise<void> {
    if (room.phase !== 'paused') return;
    const updates: Record<string, unknown> = {
      phase: 'question_answers',
      paused: false,
      currentQuestionEndsAt: Date.now() + (room.currentRemainingMs || 0),
      activePauseId: null,
      updatedAt: Date.now(),
    };
    if (room.activePauseId) updates[`pauseWindows/${room.activePauseId}/to`] = this.store.timestamp();
    await this.store.update(updates);
  }

  /** Awards points for the locked question, exactly once. */
  async showResults(): Promise<void> {
    const first = await this.store.read();
    if (!first || first.phase !== 'locked') return;
    const qIndex = first.currentQ || 0;
    if (!(await this.store.claimScoring(qIndex))) return;
    // Re-read so answers that landed during the "Time's up" beat are counted.
    const room = await this.store.read();
    if (!room || room.phase !== 'locked' || (room.currentQ || 0) !== qIndex) return;
    await this.store.update({
      phase: 'answer_results',
      updatedAt: Date.now(),
      ...resultsToUpdates(computeQuestionResults(room)),
    });
  }

  /** Host "Next": results -> scoreboard -> next question (podium after the last question). */
  async next(): Promise<void> {
    const room = await this.store.read();
    if (!room) return;
    if (room.phase === 'answer_results') {
      await this.store.update({ phase: isLastQuestion(room) ? 'final' : 'leaderboard', updatedAt: Date.now() });
      return;
    }
    if (room.phase !== 'leaderboard') return;
    if (isLastQuestion(room)) {
      await this.store.update({ phase: 'final', updatedAt: Date.now() });
      return;
    }
    await this.store.update(nextQuestionUpdates(room));
  }

  async endGame(): Promise<void> {
    await this.store.update({ phase: 'final', endedEarly: true, updatedAt: Date.now() });
  }
}
