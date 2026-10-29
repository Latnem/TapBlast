import { useEffect, useRef, useState } from 'react';
import { get, onValue, push, ref, serverTimestamp, update } from 'firebase/database';
import { MediaView, Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { db, paths } from '../lib/firebase';
import { ordinal } from '../lib/util';
import {
  answerColors,
  answerShapes,
  displayAnswersFor,
  playerAnsweredCurrent,
  sortedPlayers,
  studentRankLine,
} from '../game/rules';
import type { Player, Room } from '../game/types';

export const avatarAnimals = ['🐶', '🐱', '🦊', '🐼', '🐯', '🦁', '🐸', '🐵', '🐧', '🦉', '🐢', '🦄'];
export const avatarColors = ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#0891b2', '#ca8a04', '#db2777'];

const playerKey = (code: string) => 'tapblast_player_' + code;

export function hasStudentJoinRoute(): boolean {
  return location.hash === '#student-join' || !!new URLSearchParams(location.search).get('code');
}

interface Session {
  code: string;
  playerId: string;
}

export function StudentApp() {
  const [session, setSession] = useState<Session | null>(null);
  return session ? <StudentPlay session={session} /> : <StudentJoin onJoined={setSession} />;
}

function AvatarPicker({ emoji, color, onEmoji, onColor }: { emoji: string; color: string; onEmoji(e: string): void; onColor(c: string): void }) {
  return (
    <>
      <div className="avatar-animal-grid">
        {avatarAnimals.map((a) => (
          <button key={a} type="button" className={`avatar-animal ${a === emoji ? 'active' : ''}`} onClick={() => onEmoji(a)}>
            {a}
          </button>
        ))}
      </div>
      <div className="avatar-color-grid">
        {avatarColors.map((c) => (
          <button key={c} type="button" className={`avatar-color ${c === color ? 'active' : ''}`} style={{ background: c }} aria-label="Avatar color" onClick={() => onColor(c)} />
        ))}
      </div>
    </>
  );
}

function StudentJoin({ onJoined }: { onJoined(s: Session): void }) {
  const params = new URLSearchParams(location.search);
  const [code, setCode] = useState((params.get('code') || '').replace(/\D/g, '').slice(0, 6));
  const [name, setName] = useState((params.get('name') || '').slice(0, 20));
  const [emoji, setEmoji] = useState(avatarAnimals[0]);
  const [color, setColor] = useState(avatarColors[0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function join() {
    const c = code.replace(/\D/g, '').slice(0, 6);
    const n = name.trim().slice(0, 20);
    setError('');
    if (!c) return setError('Enter the 6-digit room code');
    if (!n) return setError('Pick a nickname');
    setBusy(true);
    try {
      const roomSnap = await get(paths.room(c));
      if (!roomSnap.exists()) return setError('Room not found. Check the code and try again.');
      const room = roomSnap.val() as Room;
      if (room.phase === 'ended') return setError('This game has ended.');
      // Re-joining from the same tab keeps the same player (and score).
      const playerId = sessionStorage.getItem(playerKey(c)) || push(ref(db)).key!;
      sessionStorage.setItem(playerKey(c), playerId);
      const existing: Partial<Player> = room.players?.[playerId] || {};
      await update(paths.player(c, playerId), {
        name: n,
        joinedAt: existing.joinedAt || Date.now(),
        lastSeenAt: serverTimestamp(),
        score: typeof existing.score === 'number' ? existing.score : 0,
        streak: existing.streak || 0,
        answerQ: typeof existing.answerQ === 'number' ? existing.answerQ : -1,
        avatarEmoji: emoji,
        avatarColor: color,
      });
      onJoined({ code: c, playerId });
    } catch (err) {
      console.error('Join failed:', err);
      setError('Could not join. Check internet connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const onEnter = (e: React.KeyboardEvent) => e.key === 'Enter' && join();

  return (
    <Screen id="student-join-screen">
      <div className="join-wrap">
        <div className="join-shell">
          <section className="join-hero">
            <div className="join-brand">
              Tap<em>Blast</em>
            </div>
            <div className="join-hero-copy">Enter the room code your teacher shared, pick a nickname, and get ready to play.</div>
          </section>
          <section className="join-card">
            <div className="join-card-title">Join Game</div>
            <div className="join-card-sub">Fast, fun, and no sign-up needed.</div>
            <div className="field">
              <label htmlFor="studentCode">Room Code</label>
              <input id="studentCode" type="text" maxLength={6} inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={onEnter} />
            </div>
            <div className="field">
              <label htmlFor="studentName">Nickname</label>
              <input id="studentName" type="text" maxLength={20} placeholder="e.g., AceOfSpades" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter} />
            </div>
            <div className="field">
              <label>Avatar</label>
              <AvatarPicker emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />
            </div>
            <button id="studentJoinBtn" type="button" className="btn accent lg" style={{ width: '100%' }} disabled={busy} onClick={join}>
              <Icon name="login" />
              {busy ? 'Joining…' : 'Join Game'}
            </button>
            <div id="studentJoinError" className="error-line">
              {error}
            </div>
          </section>
        </div>
      </div>
    </Screen>
  );
}

function StudentPlay({ session }: { session: Session }) {
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const [connError, setConnError] = useState(false);
  // Shows the tapped answer instantly and blocks double taps while the write is in flight.
  const [pending, setPending] = useState<{ q: number; index: number | null }>({ q: -1, index: null });
  const [sendError, setSendError] = useState('');

  useEffect(
    () =>
      onValue(
        paths.room(session.code),
        (snap) => (setConnError(false), setRoom(snap.exists() ? (snap.val() as Room) : null)),
        (err) => (console.error('Student listener failed:', err), setConnError(true)),
      ),
    [session.code],
  );

  const player = room?.players?.[session.playerId];

  const shell = (phaseText: string, body: React.ReactNode, opts: { question?: string; progress?: string; result?: React.ReactNode; resultClass?: string; media?: React.ReactNode } = {}) => (
    <Screen id="student-screen" className="student-shell">
      <div className="student-top">
        <div id="studentTopName">{player?.name || 'Player'}</div>
        <div id="studentTopScore" className="student-top-score">
          {player?.score || 0}
        </div>
      </div>
      <div className="student-main">
        <div className="student-card">
          <div id="studentPhase" className="student-phase">
            {phaseText}
          </div>
          <div id="studentQuestionProgress" className="student-question-progress">
            {opts.progress || ''}
          </div>
          <div id="studentMedia" className="student-media">
            {opts.media}
          </div>
          <div id="studentQuestion" className="student-question">
            {opts.question || ''}
          </div>
          <div id="studentAnswerGrid" className="student-grid">
            {body}
          </div>
          <div id="studentResult" className={`student-result ${opts.resultClass || ''}`}>
            {opts.result}
          </div>
          {room?.phase === 'lobby' && player && <WaitingProfile code={session.code} playerId={session.playerId} player={player} />}
        </div>
      </div>
    </Screen>
  );

  if (connError) return shell('Connection issue', null, { question: 'Could not connect to the live game. Refresh and rejoin.' });
  if (room === undefined) return shell('Connected', null, { question: 'Loading game…' });
  if (room === null || room.phase === 'ended') return shell('Game ended', null);
  if (!player) return shell('Connected', null, { question: 'Player profile is loading…' });

  const questions = room.quiz?.questions || [];
  switch (room.phase) {
    case 'lobby':
      return shell('Waiting Room', null, { question: 'You are in! The game will start soon.' });
    case 'countdown':
      return shell('Get Ready!', null, { question: `Question ${(room.currentQ || 0) + 1}${questions.length ? ' of ' + questions.length : ''} is coming up…` });
    case 'leaderboard':
      return shell('Scoreboard', null, {
        question: studentRankLine(player, ordinal) || 'Get ready for the next question…',
        result: `${Number(player.score || 0)} pts` + ((player.streak || 0) >= 2 ? ` · 🔥 ${player.streak} streak` : ''),
      });
    case 'final': {
      const finalPlayers = sortedPlayers(room);
      const myRank = finalPlayers.findIndex((p) => p.id === session.playerId) + 1;
      return shell(
        'Final Scores',
        finalPlayers.map((p, i) => (
          <div key={p.id} className={`student-final-row ${p.id === session.playerId ? 'me' : ''}`}>
            <span>
              {i + 1}. {p.name || 'Player'}
            </span>
            <strong>{Number(p.score || 0)} pts</strong>
          </div>
        )),
        { question: (myRank ? `You finished ${ordinal(myRank)}! ` : '') + `Final score: ${player.score || 0}` },
      );
    }
  }

  const q = questions[room.currentQ];
  if (!q) return shell('Connected', null, { question: 'You are in. Waiting for the next question to load…' });

  const progress = `Question ${(room.currentQ || 0) + 1}/${questions.length}`;
  const media = q.media ? (
    <MediaView key={`${room.currentQ}-${room.phase === 'question_media'}`} media={q.media} controls={room.phase === 'question_media'} autoPlay={room.phase === 'question_media'} />
  ) : null;
  if (room.phase === 'question_media') return shell('Watch', null, { question: q.text, progress, media });

  const isReveal = room.phase === 'answer_results';
  const canAnswerPhase = room.phase === 'question_answers';
  const answeredForReal = playerAnsweredCurrent(player, room);
  const isPending = pending.q === room.currentQ;
  const hasAnswered = answeredForReal || isPending;
  const myIndex = answeredForReal ? player.currentAnswerIndex : isPending ? pending.index : null;

  const phaseText =
    room.phase === 'paused' ? 'Paused'
    : room.phase === 'locked' ? (hasAnswered ? 'Answer locked — results coming' : "Time's up!")
    : isReveal ? (player.lastCorrect ? 'Correct!' : player.lastAnswered ? 'Incorrect' : "Time's up!")
    : hasAnswered ? 'Answer locked in'
    : q.type === 'type' ? 'Type your answer'
    : 'Tap your answer';

  async function submit(fields: Partial<Player>, index: number | null) {
    if (!room || !canAnswerPhase || hasAnswered) return;
    setPending({ q: room.currentQ, index });
    setSendError('');
    try {
      await update(paths.player(session.code, session.playerId), { ...fields, answerAt: serverTimestamp(), answerQ: room.currentQ });
    } catch (err) {
      console.error('Answer submit failed:', err);
      setPending({ q: -1, index: null });
      setSendError('Could not send answer — tap again.');
    }
  }

  let body: React.ReactNode;
  if (q.type === 'type') {
    body =
      canAnswerPhase && !hasAnswered ? (
        <TypeAnswerInput onSubmit={(value) => submit({ currentTypedAnswer: value, currentAnswerIndex: null }, null)} />
      ) : (
        <div className="student-type-result">
          {isReveal ? (
            <>
              Correct answer: <strong>{q.typeAnswer || ''}</strong>
            </>
          ) : hasAnswered ? (
            'Answer locked'
          ) : (
            ''
          )}
        </div>
      );
  } else {
    body = displayAnswersFor(room, room.quiz, q).map((a, idx) => {
      const selected = hasAnswered && myIndex === a.index;
      const locked = !canAnswerPhase || hasAnswered;
      const classes = [
        'student-answer',
        answerColors[idx % 4],
        selected && 'selected',
        locked && 'locked',
        isReveal && selected && a.index === q.correctIndex && 'correct-reveal',
        isReveal && selected && a.index !== q.correctIndex && 'wrong-selected',
        isReveal && a.index === q.correctIndex && 'correct-answer-reveal',
      ]
        .filter(Boolean)
        .join(' ');
      return (
        <button key={a.index} type="button" className={classes} data-answer-index={a.index} onClick={() => submit({ currentAnswerIndex: a.index, currentTypedAnswer: null }, a.index)}>
          <span className="student-answer-shape">{answerShapes[idx % 4]}</span>
          {a.media && (
            <span className="thumb">
              <MediaView media={a.media} muted />
            </span>
          )}
          {a.text && <span className="label-text">{a.text}</span>}
        </button>
      );
    });
  }

  let result: React.ReactNode = sendError || (hasAnswered && (canAnswerPhase || room.phase === 'paused') ? 'Locked in — waiting for others' : '');
  let resultClass = '';
  if (isReveal) {
    const lines: string[] = [];
    if (player.lastCorrect) {
      lines.push(`+${Number(player.lastDelta || 0)} pts` + (player.lastBonus ? ` (includes +${player.lastBonus} streak bonus)` : ''));
      if ((player.streak || 0) >= 2) lines.push(`🔥 Answer streak ${player.streak}` + (player.streakMsg ? ' — ' + player.streakMsg : ''));
    } else {
      lines.push(player.lastAnswered ? '+0 pts — better luck next time' : '+0 pts — no answer');
    }
    const rankLine = studentRankLine(player, ordinal);
    if (rankLine) lines.push(rankLine);
    result = lines.map((l) => <div key={l}>{l}</div>);
    resultClass = player.lastCorrect ? 'correct' : 'wrong';
  }

  return shell(phaseText, body, { question: q.text, progress, media, result, resultClass });
}

function TypeAnswerInput({ onSubmit }: { onSubmit(value: string): void }) {
  const [value, setValue] = useState('');
  const send = () => value.trim() && onSubmit(value.trim());
  return (
    <div className="student-type-wrap">
      <input id="studentTypedAnswer" type="text" placeholder="Type answer" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
      <button id="studentTypeSubmit" type="button" className="btn accent" onClick={send}>
        Submit
      </button>
    </div>
  );
}

/** While waiting in the lobby, players can still change their name and avatar. */
function WaitingProfile({ code, playerId, player }: { code: string; playerId: string; player: Player }) {
  const [name, setName] = useState(player.name || '');
  const [emoji, setEmoji] = useState(player.avatarEmoji || avatarAnimals[0]);
  const [color, setColor] = useState(player.avatarColor || avatarColors[0]);
  const [saved, setSaved] = useState('');
  const timer = useRef<number>();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function save() {
    const n = name.trim().slice(0, 20);
    if (!n) return;
    try {
      await update(paths.player(code, playerId), { name: n, avatarEmoji: emoji, avatarColor: color, profileUpdatedAt: serverTimestamp() });
      setSaved('Updated');
      timer.current = window.setTimeout(() => setSaved(''), 1200);
    } catch (err) {
      console.error(err);
      setSaved('Could not update profile.');
    }
  }

  return (
    <div id="studentWaitingProfile" className="student-waiting-profile" style={{ display: 'block' }}>
      <div className="student-wait-title">Waiting for host to start</div>
      <div className="student-wait-note">You can still edit your name, emoji, and color.</div>
      <div className="student-profile-preview">
        <div id="studentProfileEmojiPreview" className="student-profile-emoji-preview" style={{ background: color }}>
          {emoji}
        </div>
        <input id="studentProfileNameInput" type="text" maxLength={20} placeholder="Nickname" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
      <AvatarPicker emoji={emoji} color={color} onEmoji={setEmoji} onColor={setColor} />
      <button id="studentSaveProfileBtn" type="button" className="btn accent" style={{ width: '100%' }} onClick={save}>
        Update Profile
      </button>
      <div id="studentProfileSavedLine" className="student-profile-saved">
        {saved}
      </div>
    </div>
  );
}

