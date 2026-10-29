import { useCallback, useEffect, useState } from 'react';
import { signOut, type User } from 'firebase/auth';
import { get, onValue, remove, set } from 'firebase/database';
import { auth, paths } from './lib/firebase';
import * as api from './lib/teacherApi';
import { quizFromPdf } from './lib/pdfImport';
import { clone } from './lib/util';
import { defaultQuiz } from './game/rules';
import { FirebaseRoomStore, LocalRoomStore, type RoomStore } from './game/roomStore';
import type { AppSettings, Folder, Quiz, Room } from './game/types';
import { LoginScreen } from './screens/LoginScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { EditorScreen } from './screens/EditorScreen';
import { HostGame } from './screens/HostGame';
import { SettingsModal, ShareQuizModal } from './modals/SettingsModal';

type View =
  | { kind: 'library' }
  | { kind: 'editor'; quiz: Quiz }
  | { kind: 'host'; store: RoomStore; code: string }
  | { kind: 'preview'; store: RoomStore; quiz: Quiz };

export function TeacherApp({ user }: { user: User }) {
  const [role, setRole] = useState<api.Role | null>(null);
  const [settings, setSettings] = useState<AppSettings>(api.DEFAULT_SETTINGS);
  const cached = api.readLibraryCache(user.uid);
  const [folders, setFolders] = useState<Folder[]>(() => sortFolders(cached?.folders || []));
  const [quizzes, setQuizzes] = useState<Quiz[]>(() => sortQuizzes(cached?.quizzes || []));
  const [syncText, setSyncText] = useState(cached ? 'Syncing…' : 'Loading quizzes…');
  const [view, setView] = useState<View>({ kind: 'library' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareQuiz, setShareQuiz] = useState<Quiz | null>(null);

  // Access check, settings, and resuming a game that was in progress.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await api.checkTeacherAccess(user);
      if (cancelled) return;
      setRole(r);
      if (r === 'blocked') return;
      setSettings(await api.loadAppSettings());
      await api.ensureDefaultFolders(user.uid).catch((err) => console.warn(err));
      try {
        const session = (await get(paths.hostSession(user.uid))).val();
        const code = session?.roomCode;
        if (code && !cancelled) {
          const room = (await get(paths.room(code))).val() as Room | null;
          if (room && room.phase !== 'ended') setView({ kind: 'host', store: new FirebaseRoomStore(paths.room(code)), code });
        }
      } catch (err) {
        console.warn('Could not resume hosted game:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Live library sync (cached copy shows instantly while this loads).
  useEffect(() => {
    if (!role || role === 'blocked') return;
    const offFolders = onValue(paths.folders(user.uid), (snap) => setFolders(sortFolders(Object.values(snap.val() || {}))), (err) => console.error('Folder sync failed:', err));
    const offQuizzes = onValue(
      paths.quizzes(user.uid),
      (snap) => {
        setQuizzes(sortQuizzes(Object.values(snap.val() || {})));
        setSyncText('Synced');
      },
      (err) => {
        console.error('Quiz sync failed:', err);
        setSyncText(cached ? 'Showing cached quizzes · Sync failed' : 'Could not load quizzes. Check connection.');
      },
    );
    return () => {
      offFolders();
      offQuizzes();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, user.uid]);

  useEffect(() => {
    if (syncText === 'Synced') api.writeLibraryCache(user.uid, quizzes, folders);
  }, [quizzes, folders, syncText, user.uid]);

  async function startHosting(quiz: Quiz) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const room: Room = {
      code,
      hostUid: user.uid,
      hostName: user.displayName || user.email || 'Teacher',
      quiz: clone(quiz),
      currentQ: 0,
      phase: 'lobby',
      currentQuestionStartedAt: 0,
      currentQuestionEndsAt: 0,
      currentRemainingMs: 0,
      paused: false,
      players: {},
      updatedAt: Date.now(),
    };
    await set(paths.room(code), room);
    await set(paths.hostSession(user.uid), { roomCode: code, updatedAt: Date.now() });
    setView({ kind: 'host', store: new FirebaseRoomStore(paths.room(code)), code });
  }

  function startPreview(quiz: Quiz) {
    const room: Room = {
      code: 'PREVIEW',
      hostUid: user.uid,
      hostName: user.displayName || user.email || 'Teacher',
      quiz: clone(quiz),
      currentQ: 0,
      phase: 'lobby',
      players: {},
      updatedAt: Date.now(),
    };
    setView({ kind: 'preview', store: new LocalRoomStore(room), quiz });
  }

  const exitHost = useCallback(
    (endSession: boolean) => {
      setView((v) => {
        if (v.kind === 'preview') return { kind: 'editor', quiz: v.quiz };
        if (endSession) remove(paths.hostSession(user.uid)).catch(console.error);
        return { kind: 'library' };
      });
    },
    [user.uid],
  );

  if (role === 'blocked') return <LoginScreen message={`Access pending approval for ${user.email || 'this account'}. Ask the TapBlast admin to whitelist this email.`} />;

  let screen;
  if (view.kind === 'editor') {
    screen = (
      <EditorScreen
        key={view.quiz.id}
        initialQuiz={view.quiz}
        folders={folders}
        settings={settings}
        onBack={() => setView({ kind: 'library' })}
        onSave={async (quiz) => {
          await api.saveQuiz(user.uid, quiz);
          setView({ kind: 'library' });
        }}
        onPreview={startPreview}
      />
    );
  } else if (view.kind === 'host' || view.kind === 'preview') {
    screen = <HostGame key={view.kind === 'host' ? view.code : 'preview'} store={view.store} preview={view.kind === 'preview'} onExit={exitHost} />;
  } else {
    screen = (
      <LibraryScreen
        teacherName={user.displayName || user.email || 'Teacher'}
        folders={folders}
        quizzes={quizzes}
        syncText={syncText}
        actions={{
          onCreate: () => setView({ kind: 'editor', quiz: defaultQuiz(settings) }),
          onEdit: (quiz) => setView({ kind: 'editor', quiz: clone(quiz) }),
          onHost: startHosting,
          onDuplicate: (quiz) => api.duplicateQuiz(user.uid, quiz),
          onDelete: (quiz) => api.deleteQuiz(user.uid, quiz.id),
          onShare: setShareQuiz,
          onMove: (quizId, folderId) => api.moveQuiz(user.uid, quizId, folderId),
          onSaveFolder: (folder) => api.saveFolder(user.uid, folder),
          onDeleteFolder: (folder) => api.deleteFolder(user.uid, folder.id, quizzes),
          onImportPdf: async (file) => {
            try {
              const quiz = await quizFromPdf(file);
              setView({ kind: 'editor', quiz });
              alert(`Imported ${quiz.questions.length} questions from PDF. Please review detected correct answers before saving.`);
            } catch (err) {
              console.error(err);
              alert('PDF import failed: ' + ((err as Error)?.message || err));
            }
          },
          onOpenSettings: () => setSettingsOpen(true),
          onLogout: () => signOut(auth).catch(console.error),
        }}
      />
    );
  }

  return (
    <>
      {screen}
      {settingsOpen && role && (
        <SettingsModal user={user} role={role} settings={settings} quizzes={quizzes} folders={folders} onSettingsSaved={setSettings} onSharedChanged={() => {}} onClose={() => setSettingsOpen(false)} />
      )}
      {shareQuiz && <ShareQuizModal user={user} quiz={shareQuiz} onClose={() => setShareQuiz(null)} />}
    </>
  );
}

const sortFolders = (list: Folder[]) => list.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
const sortQuizzes = (list: Quiz[]) => list.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
