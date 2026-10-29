import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';
import { child, getDatabase, ref, type DatabaseReference } from 'firebase/database';

// Same Firebase project and data path as the original single-file app,
// so every existing quiz, folder, setting and share carries over.
const firebaseConfig = {
  apiKey: 'AIzaSyCjh16vsvzWmt9dUkH6O4brRf8hfTOhzYA',
  authDomain: 'tapblast-8e13a.firebaseapp.com',
  projectId: 'tapblast-8e13a',
  databaseURL: 'https://tapblast-8e13a-default-rtdb.firebaseio.com',
  storageBucket: 'tapblast-8e13a.firebasestorage.app',
  messagingSenderId: '1069456061706',
  appId: '1:1069456061706:web:0fc650dfac4de09de536f3',
  measurementId: 'G-QLTZFNLH2X',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
setPersistence(auth, browserLocalPersistence).catch(console.error);

export const ROOT = 'tapblast_clean_v1';
export const ADMIN_EMAIL = 'ngoht83@gmail.com';

export const emailKey = (email: string): string =>
  String(email || '').trim().toLowerCase().replace(/[.#$[\]]/g, '_');

const rootRef = (path: string): DatabaseReference => ref(db, `${ROOT}/${path}`);

export const paths = {
  quizzes: (uid: string) => rootRef(`quizzes/${uid}`),
  quiz: (uid: string, id: string) => rootRef(`quizzes/${uid}/${id}`),
  folders: (uid: string) => rootRef(`folders/${uid}`),
  folder: (uid: string, id: string) => rootRef(`folders/${uid}/${id}`),
  room: (code: string) => rootRef(`rooms/${code}`),
  player: (code: string, playerId: string) => rootRef(`rooms/${code}/players/${playerId}`),
  hostSession: (uid: string) => rootRef(`hostSessions/${uid}`),
  appSettings: () => rootRef('appSettings'),
  whitelist: () => rootRef('accessWhitelist'),
  whitelistEntry: (email: string) => rootRef(`accessWhitelist/${emailKey(email)}`),
  accessRequests: () => rootRef('accessRequests'),
  accessRequest: (email: string) => rootRef(`accessRequests/${emailKey(email)}`),
  sharedInbox: (email: string) => rootRef(`sharedQuizzes/${emailKey(email)}`),
  sharedItem: (email: string, id: string) => rootRef(`sharedQuizzes/${emailKey(email)}/${id}`),
};

export { child };
