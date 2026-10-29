import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Brand, MediaView, Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { HostController } from '../game/hostController';
import type { RoomStore } from '../game/roomStore';
import {
  COUNTDOWN_MS,
  RESULTS_GRACE_MS,
  answerColors,
  answerShapes,
  displayAnswersFor,
  everyoneAnswered,
  isLastQuestion,
  isTypeAnswerCorrect,
  playerAnsweredCurrent,
  sortedPlayers,
  type DisplayAnswer,
} from '../game/rules';
import type { PlayerWithId, Question, Room } from '../game/types';

export const getJoinUrl = (code: string) => `${location.origin}${location.pathname}?code=${encodeURIComponent(code || '')}`;
const qrUrl = (url: string) => 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(url);

export function HostGame({ store, preview, onExit }: { store: RoomStore; preview: boolean; onExit(endSession: boolean): void }) {
  const host = useMemo(() => new HostController(store), [store]);
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const roomRef = useRef<Room | null | undefined>(undefined);
  roomRef.current = room;

  useEffect(() => store.subscribe(setRoom, (err) => console.error('Host room listener failed:', err)), [store]);

  useEffect(() => {
    if (room === null || room?.phase === 'ended') onExit(false);
  }, [room, onExit]);

  // Timers that drive the game. Each one re-reads the latest room via roomRef,
  // and only restarts when the phase or question changes (not on every answer).
  const [, setTick] = useState(0);
  const countdownEnd = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const phase = room?.phase;
  const currentQ = room?.currentQ;
  if (room?.phase === 'countdown') {
    const key = `${room.currentQ}|${room.countdownEndsAt || 0}`;
    if (countdownEnd.current.key !== key) countdownEnd.current = { key, at: room.countdownEndsAt || Date.now() + COUNTDOWN_MS };
  }
  useEffect(() => {
    const r = roomRef.current;
    if (!r) return;
    if (r.phase === 'countdown') {
      const id = setInterval(() => {
        setTick((t) => t + 1);
        const cur = roomRef.current;
        if (cur?.phase === 'countdown' && Date.now() >= countdownEnd.current.at) host.finishCountdown(cur);
      }, 100);
      return () => clearInterval(id);
    }
    if (r.phase === 'question_answers') {
      const id = setInterval(() => {
        setTick((t) => t + 1);
        const cur = roomRef.current;
        if (cur?.phase !== 'question_answers') return;
        // End the question when time runs out OR every player has answered.
        if (Date.now() >= (cur.currentQuestionEndsAt || 0) || everyoneAnswered(cur)) host.lockQuestion(cur);
      }, 200);
      return () => clearInterval(id);
    }
    if (r.phase === 'locked') {
      // Short "Time's up!" beat, which also lets answers already in flight land.
      const t = setTimeout(() => host.showResults(), RESULTS_GRACE_MS);
      return () => clearTimeout(t);
    }
  }, [phase, currentQ, host]);

  // Keyboard shortcuts: Space pauses/resumes, → or Enter moves on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = ((e.target as HTMLElement)?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;
      const r = roomRef.current;
      if (!r) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (r.phase === 'question_answers') host.pause(r);
        else if (r.phase === 'paused') host.resume(r);
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        if (r.phase === 'locked') host.showResults();
        else if (r.phase === 'answer_results' || r.phase === 'leaderboard') host.next();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [host]);

  if (!room) return null;

  const endGame = () => (preview ? onExit(true) : host.endGame());
  if (room.phase === 'leaderboard') return <Leaderboard room={room} onNext={() => host.next()} onEnd={endGame} />;
  if (room.phase === 'final') return <FinalResults room={room} onBack={() => onExit(true)} />;
  if (room.phase === 'lobby') return <Lobby room={room} preview={preview} onStart={() => host.startQuiz()} onEnd={endGame} />;
  return <QuestionView room={room} host={host} countdownAt={countdownEnd.current.at} onEnd={endGame} />;
}

function Lobby({ room, preview, onStart, onEnd }: { room: Room; preview: boolean; onStart(): void; onEnd(): void }) {
  const players = sortedPlayers(room);
  const join = preview ? 'Preview mode' : getJoinUrl(room.code);
  return (
    <HostShell timer={null}>
      <div id="hostLobby" className="lobby-card lobby-combined" style={{ display: 'grid' }}>
        <div className="lobby-left-panel">
          <div className="lobby-title" id="lobbyQuizTitle">
            {room.quiz.title || 'Quiz'}
          </div>
          <div className="lobby-subtitle"></div>
          <div id="roomCodeDisplay" className="code">
            {room.code || '----'}
          </div>
          <div id="joinUrlLabel" className="join-url">
            {join}
          </div>
          <div className="qr-box">{!preview && <img id="qrImage" alt="Join QR" src={qrUrl(join)} />}</div>
        </div>
        <div className="lobby-right-panel">
          <div className="player-count-head">
            <span>Players</span>
            <span className="player-count-pill" id="playerCountText">
              {players.length}
            </span>
          </div>
          <div id="playerChips" className="player-chips">
            {players.length ? (
              players.map((p) => (
                <div key={p.id} className="player-chip player-chip-clean">
                  <span className="player-avatar-square" style={{ background: p.avatarColor || '#2563eb' }}>
                    {p.avatarEmoji || '🐶'}
                  </span>
                  <span className="player-chip-name">{p.name}</span>
                </div>
              ))
            ) : (
              <div style={{ opacity: 0.6, fontSize: '.88rem' }}>Waiting for players to join…</div>
            )}
          </div>
          <div className="control-row lobby-actions">
            <button id="startQuizBtn" type="button" className="btn accent lg" onClick={onStart}>
              <Icon name="play_arrow" />
              Start Quiz
            </button>
            <button id="endLobbyBtn" type="button" className="btn outline" onClick={onEnd}>
              End Game
            </button>
          </div>
        </div>
      </div>
    </HostShell>
  );
}

/** Top bar with the brand, the striped countdown bar and the seconds counter. */
function HostShell({ timer, children }: { timer: { text: string; ratio: number } | null; children: React.ReactNode }) {
  const fill = useRef<HTMLDivElement>(null);
  const stripes = useRef<HTMLDivElement>(null);
  const mask = useRef<HTMLDivElement>(null);
  const timerEl = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (timer) applyTimerVisual(timer.ratio, fill.current, stripes.current, mask.current, timerEl.current);
  });
  const hide = timer ? '' : 'hidden';
  return (
    <Screen id="host-screen" className="host-shell">
      <div style={{ width: '100%' }}>
        <div className="host-top">
          <Brand />
          <div className={`progress mixed-countdown-bar ${hide}`}>
            <div id="hostProgressFill" ref={fill} className={hide}></div>
            <div id="hostProgressStripes" ref={stripes} className={hide}></div>
            <div id="hostProgressMask" ref={mask} className={hide}></div>
          </div>
          <div id="hostTimer" ref={timerEl} className={`timer ${hide}`}>
            {timer?.text || ''}
          </div>
        </div>
        <div className="host-content">{children}</div>
      </div>
    </Screen>
  );
}

function applyTimerVisual(ratio: number, fill: HTMLElement | null, stripes: HTMLElement | null, mask: HTMLElement | null, timerEl: HTMLElement | null) {
  const set = (el: HTMLElement | null, styles: Record<string, string>) => el && Object.entries(styles).forEach(([k, v]) => el.style.setProperty(k, v, 'important'));
  const gradient = 'linear-gradient(to right,#dc2626 0%,#f59e0b 32%,#d7d528 62%,#18a558 100%)';
  set(fill, {
    display: 'block', position: 'absolute', inset: '0', width: '100%', height: '100%', transform: 'none', 'clip-path': 'none',
    background: gradient, 'background-image': gradient, 'background-size': '100% 100%', 'background-position': 'left center', 'border-radius': '0', 'box-shadow': 'none',
  });
  set(stripes, {
    display: 'block', position: 'absolute', inset: '0', 'z-index': '2', 'pointer-events': 'none',
    background: 'repeating-linear-gradient(135deg, rgba(255,255,255,.18) 0px, rgba(255,255,255,.18) 8px, rgba(255,255,255,0) 8px, rgba(255,255,255,0) 16px)',
  });
  set(mask, {
    display: 'block', position: 'absolute', top: '0', right: '0', height: '100%', width: (1 - Math.max(0, Math.min(1, ratio))) * 100 + '%',
    background: '#3b4c71', 'border-radius': '0', transition: 'width .18s linear', 'z-index': '3',
  });
  set(timerEl, { color: '#ffffff', 'text-shadow': 'none' });
}

const PHASE_TAG: Partial<Record<Room['phase'], string>> = {
  countdown: 'Get Ready!',
  question_media: 'Watch',
  question_answers: 'Choose your answer',
  paused: 'Paused',
  locked: "Time's up!",
  answer_results: 'Results',
};

function QuestionView({ room, host, countdownAt, onEnd }: { room: Room; host: HostController; countdownAt: number; onEnd(): void }) {
  const q = room.quiz.questions[room.currentQ];
  const totalMs = Math.max(1, (q.seconds || 20) * 1000);
  const phase = room.phase;
  const isReveal = phase === 'answer_results';

  let remainingMs = totalMs;
  if (phase === 'question_answers') remainingMs = Math.max(0, (room.currentQuestionEndsAt || 0) - Date.now());
  else if (phase === 'paused') remainingMs = room.currentRemainingMs || 0;
  else if (phase === 'locked' || isReveal) remainingMs = 0;
  const timerText =
    phase === 'countdown' || phase === 'question_media' ? '--' : String(Math.ceil(remainingMs / 1000));
  const countdownNum = Math.max(1, Math.ceil((countdownAt - Date.now()) / 1000));

  const players = sortedPlayers(room);
  const answered = players.filter((p) => playerAnsweredCurrent(p, room)).length;
  const showAnswers = phase !== 'countdown' && phase !== 'question_media';
  const isTypeQuestion = q.type === 'type';
  const answers = isTypeQuestion ? [] : displayAnswersFor(room, room.quiz, q);

  const notice =
    phase === 'question_media' ? 'Video plays first — answers appear when it ends.'
    : phase === 'locked' ? 'Showing results…'
    : phase === 'paused' ? 'Question paused.'
    : isReveal ? 'Results are shown. Continue when ready.'
    : phase === 'question_answers' ? 'Press space to pause.'
    : '';

  return (
    <HostShell timer={{ text: timerText, ratio: remainingMs / totalMs }}>
      <div id="hostQuestionPanel" className={`host-card host-question-layout ${q.media ? 'has-media' : 'no-media'} ${q.type === 'truefalse' ? 'tf-question' : ''} ${isReveal ? 'phase-results' : ''}`} style={{ display: 'grid' }}>
        <div className="host-left-media-col">
          <div id="hostMedia" className="host-media">
            {q.media?.type === 'video' ? (
              <video
                key={`${room.currentQ}-${phase === 'question_media'}`}
                id="hostVideo"
                src={q.media.dataUrl}
                autoPlay={phase === 'question_media'}
                controls
                onEnded={() => phase === 'question_media' && host.videoEnded()}
              />
            ) : (
              <MediaView media={q.media} />
            )}
          </div>
        </div>
        <div className="host-right-content-col">
          <div id="hostPhaseTag" className="phase-tag">
            {PHASE_TAG[phase] || ''}
          </div>
          <div id="hostQuestionProgress" className="game-question-progress">
            Question {(room.currentQ || 0) + 1}/{room.quiz.questions.length}
          </div>
          {phase === 'countdown' ? (
            <div key={countdownNum} id="hostQuestionText" className="host-question countdown">
              {countdownNum}
            </div>
          ) : (
            <div id="hostQuestionText" className="host-question">
              {q.text || ''}
            </div>
          )}
          <div id="hostAnswers" className="host-answers">
            {isTypeQuestion ? (
              <div className={`host-type-answer ${showAnswers ? '' : 'hidden'}`}>
                <div className="host-type-answer-title">{isReveal ? 'Correct answer' : 'Students type their answer'}</div>
                <div className="host-type-answer-value">{isReveal ? q.typeAnswer || '' : 'Waiting for responses…'}</div>
              </div>
            ) : (
              answers.map((a, idx) => (
                <div
                  key={a.index}
                  className={`host-answer ${answerColors[idx % 4]} ${isReveal && a.index === q.correctIndex ? 'correct' : ''} ${isReveal && a.index !== q.correctIndex ? 'dim' : ''} ${showAnswers ? '' : 'hidden'}`}
                >
                  <AnswerContent answer={a} idx={idx} />
                </div>
              ))
            )}
          </div>
          {isReveal && players.length > 0 && <Distribution room={room} q={q} answers={answers} players={players} />}
          <div id="hostStats" className="stat-row">
            <div className="stat">
              <div className="n">{answered}</div>
              <div className="stat-label">Answered</div>
            </div>
            <div className="stat">
              <div className="n">{Math.max(0, players.length - answered)}</div>
              <div className="stat-label">Waiting</div>
            </div>
            <div className="stat">
              <div className="n">{players.length}</div>
              <div className="stat-label">Players</div>
            </div>
          </div>
          <div id="hostNotice" className="notice">
            {notice}
          </div>
          <div className="control-row">
            {phase === 'question_answers' && (
              <button id="pauseBtn" type="button" className="btn outline" onClick={() => host.pause(room)}>
                <Icon name="pause" />
                Pause
              </button>
            )}
            {phase === 'paused' && (
              <button id="resumeBtn" type="button" className="btn accent" onClick={() => host.resume(room)}>
                <Icon name="play_arrow" />
                Resume
              </button>
            )}
            {(phase === 'question_answers' || phase === 'paused' || phase === 'question_media') && (
              <button id="showResultsBtn" type="button" className="btn accent" onClick={() => host.skip(room)}>
                Skip
              </button>
            )}
            {isReveal && (
              <button id="nextQuestionBtn" type="button" className="btn accent" onClick={() => host.next()}>
                {isLastQuestion(room) ? 'Final Results' : 'Scoreboard'}
              </button>
            )}
            <button id="endGameBtn" type="button" className="btn outline" onClick={onEnd}>
              End Game
            </button>
          </div>
        </div>
      </div>
    </HostShell>
  );
}

function AnswerContent({ answer, idx }: { answer: DisplayAnswer; idx: number }) {
  return (
    <>
      <span className="host-answer-shape">{answerShapes[idx % 4]}</span>
      {answer.media && (
        <span className="thumb">
          <MediaView media={answer.media} muted />
        </span>
      )}
      {answer.text && <span className="label-text">{answer.text}</span>}
    </>
  );
}

function Distribution({ room, q, answers, players }: { room: Room; q: Question; answers: DisplayAnswer[]; players: PlayerWithId[] }) {
  const forThisQ = players.filter((p) => p.answerQ === room.currentQ);
  const rows =
    q.type === 'type'
      ? (() => {
          const typed = forThisQ.filter((p) => typeof p.currentTypedAnswer === 'string');
          const correct = typed.filter((p) => isTypeAnswerCorrect(q, p.currentTypedAnswer)).length;
          return [
            { key: 'c', shape: 'C', color: 'green', label: `Correct: ${correct} player${correct === 1 ? '' : 's'}` },
            { key: 'i', shape: 'I', color: 'orange', label: `Incorrect: ${typed.length - correct} player${typed.length - correct === 1 ? '' : 's'}` },
          ];
        })()
      : answers.map((a, idx) => {
          const c = forThisQ.filter((p) => p.currentAnswerIndex === a.index).length;
          return { key: String(a.index), shape: answerShapes[idx], color: answerColors[idx % 4], label: `${c} player${c === 1 ? '' : 's'}` };
        });
  return (
    <div id="hostDistribution" className="answer-dist">
      {rows.map((r) => (
        <div key={r.key} className="dist-row">
          <div className={`dist-shape ${r.color}`}>{r.shape}</div>
          <div className="dist-label">{r.label}</div>
        </div>
      ))}
      <div className="host-inline-board">
        <div className="host-inline-board-title">Current Scores</div>
        {players.slice(0, 5).map((p, i) => (
          <div key={p.id} className="host-score-row">
            <span className="host-score-rank">{i + 1}</span>
            <span className="host-score-name">{p.name}</span>
            <span className="host-score-delta">+{Number(p.lastDelta || 0)}</span>
            <span className="host-score-total">{p.score || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Leaderboard({ room, onNext, onEnd }: { room: Room; onNext(): void; onEnd(): void }) {
  const players = sortedPlayers(room);
  return (
    <Screen id="leaderboard-screen">
      <div style={{ width: '100%' }}>
        <div className="topbar">
          <div>
            <Brand />
            <div className="subtle">Scoreboard</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button id="leaderboardNextBtn" type="button" className="btn accent" onClick={onNext}>
              Next Question
              <Icon name="arrow_forward" />
            </button>
            <button id="leaderboardEndBtn" type="button" className="btn outline" onClick={onEnd}>
              End Game
            </button>
          </div>
        </div>
        <div className="lb-shell">
          <div className="lb-card">
            <div id="leaderboardTitle" className="lb-title">
              After Question {(room.currentQ || 0) + 1}
            </div>
            <div id="leaderboardList">
              {players.length ? (
                players.map((p, i) => {
                  const delta = typeof p.prevRank === 'number' && typeof p.rank === 'number' ? p.prevRank - p.rank : 0;
                  const medal = ['🥇', '🥈', '🥉'][i];
                  return (
                    <div key={p.id} className={`rank-row ${i < 3 ? 'top' : ''}`}>
                      <div className="rank-no">{medal || i + 1}</div>
                      <div className="rank-name">
                        {p.name} {(p.streak || 0) >= 2 && <span className="rank-streak">🔥 {p.streak}</span>}
                      </div>
                      <div className={`rank-delta ${delta < 0 ? 'neg' : ''}`}>{delta > 0 ? `↑ ${delta}` : delta < 0 ? `↓ ${-delta}` : ''}</div>
                      <div style={{ fontSize: '.88rem', color: 'var(--success)', fontWeight: 700, minWidth: 55, textAlign: 'right' }}>{p.lastDelta ? '+' + p.lastDelta : ''}</div>
                      <div className="rank-score">{p.score || 0}</div>
                    </div>
                  );
                })
              ) : (
                <div className="host-score-empty">No players</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Screen>
  );
}

function FinalResults({ room, onBack }: { room: Room; onBack(): void }) {
  const players = sortedPlayers(room);
  const initials = (n: string) => (n || '').trim().slice(0, 2).toUpperCase() || '??';
  const pod = (p: PlayerWithId, cls: string, place: number) => (
    <div className={`pod ${cls}`}>
      <div className="pod-avatar">{initials(p.name)}</div>
      <div className="pod-name">{p.name}</div>
      <div className="pod-score">{p.score || 0} pts</div>
      <div className="pod-block">{place}</div>
    </div>
  );
  return (
    <Screen id="final-screen">
      <div style={{ width: '100%' }}>
        <div className="topbar">
          <div>
            <Brand />
            <div className="subtle">Final Results 🎉</div>
          </div>
          <button id="finalLibraryBtn" type="button" className="btn accent" onClick={onBack}>
            <Icon name="home" />
            Back to Library
          </button>
        </div>
        <div className="final-wrap">
          {players.length >= 3 && (
            <div id="podiumCard" className="lb-card">
              <div className="lb-title">Podium</div>
              <div id="podium" className="podium">
                {pod(players[1], 'silver', 2)}
                {pod(players[0], 'gold', 1)}
                {pod(players[2], 'bronze', 3)}
              </div>
            </div>
          )}
          <div className="lb-card">
            <div className="lb-title">All Players</div>
            <div id="finalList">
              {players.map((p, i) => (
                <div key={p.id} className={`rank-row ${i < 3 ? 'top' : ''}`}>
                  <div className="rank-no">{['🥇', '🥈', '🥉'][i] || i + 1}</div>
                  <div className="rank-name">{p.name}</div>
                  <div className="rank-score">{p.score || 0}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Screen>
  );
}
