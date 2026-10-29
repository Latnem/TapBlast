import type { User } from 'firebase/auth';
import { get, remove, set, update } from 'firebase/database';
import { ADMIN_EMAIL, paths } from './firebase';
import { clone, genId } from './util';
import { defaultQuiz, normalizeImportedQuiz } from '../game/rules';
import type { AppSettings, Folder, Quiz } from '../game/types';

export type Role = 'admin' | 'teacher' | 'blocked';

export const DEFAULT_SETTINGS: AppSettings = { defaultSeconds: 20, defaultQuestionType: 'quiz' };

/* ---------- access ---------- */

export async function checkTeacherAccess(user: User): Promise<Role> {
  const email = String(user.email || '').toLowerCase();
  if (email === ADMIN_EMAIL) {
    update(paths.whitelistEntry(ADMIN_EMAIL), { email: ADMIN_EMAIL, role: 'admin', enabled: true, updatedAt: Date.now() }).catch((err) =>
      console.warn('Admin whitelist seed skipped:', err),
    );
    return 'admin';
  }
  try {
    const record = (await get(paths.whitelistEntry(email))).val();
    if (record && record.enabled !== false) return (record.role as Role) || 'teacher';
  } catch (err) {
    console.warn('Whitelist check failed:', err);
  }
  try {
    await update(paths.accessRequest(email), {
      email,
      displayName: user.displayName || '',
      uid: user.uid || '',
      status: 'pending',
      requestedAt: Date.now(),
    });
  } catch (err) {
    console.warn('Access request could not be saved:', err);
  }
  return 'blocked';
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const snap = await get(paths.appSettings());
    if (snap.exists()) return { ...DEFAULT_SETTINGS, ...(snap.val() || {}) };
    await update(paths.appSettings(), DEFAULT_SETTINGS);
  } catch (err) {
    console.warn('App settings unavailable, using defaults:', err);
  }
  return { ...DEFAULT_SETTINGS };
}

export const saveAppSettings = (s: AppSettings) => update(paths.appSettings(), s);

export interface WhitelistUser {
  email: string;
  role?: string;
  enabled?: boolean;
}
export interface AccessRequest {
  email: string;
  displayName?: string;
  status: string;
  requestedAt?: number;
}

export async function loadAdminLists(): Promise<{ whitelist: WhitelistUser[]; requests: AccessRequest[] }> {
  const [w, r] = await Promise.all([get(paths.whitelist()), get(paths.accessRequests())]);
  const whitelist = Object.values((w.val() || {}) as Record<string, WhitelistUser>).sort((a, b) =>
    String(a.email).localeCompare(String(b.email)),
  );
  const requests = Object.values((r.val() || {}) as Record<string, AccessRequest>)
    .filter((x) => x.status === 'pending')
    .sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
  return { whitelist, requests };
}

export async function approveUser(email: string) {
  email = email.toLowerCase();
  await update(paths.whitelistEntry(email), { email, role: 'teacher', enabled: true, updatedAt: Date.now() });
  await update(paths.accessRequest(email), { status: 'approved', decidedAt: Date.now() });
}
export async function denyUser(email: string) {
  await update(paths.accessRequest(email.toLowerCase()), { status: 'denied', decidedAt: Date.now() });
}
export async function addWhitelistEmail(email: string) {
  email = email.toLowerCase();
  await update(paths.whitelistEntry(email), { email, role: 'teacher', enabled: true, updatedAt: Date.now() });
}
export async function toggleUserEnabled(email: string) {
  email = email.toLowerCase();
  const u = ((await get(paths.whitelistEntry(email))).val() || { email, role: 'teacher' }) as WhitelistUser;
  await update(paths.whitelistEntry(email), { email, role: u.role || 'teacher', enabled: u.enabled === false, updatedAt: Date.now() });
}

/* ---------- folders + quizzes ---------- */

export async function ensureDefaultFolders(uid: string) {
  if ((await get(paths.folders(uid))).exists()) return;
  const updates: Record<string, Folder> = {};
  ['Math', 'Science'].forEach((name) => {
    const f = { id: genId(), name, updatedAt: Date.now() };
    updates[f.id] = f;
  });
  await update(paths.folders(uid), updates);
}

export const saveFolder = (uid: string, folder: Folder) => set(paths.folder(uid, folder.id), folder);

export async function deleteFolder(uid: string, folderId: string, quizzes: Quiz[]) {
  for (const q of quizzes.filter((x) => x.folderId === folderId)) {
    await update(paths.quiz(uid, q.id), { folderId: '', updatedAt: Date.now() });
  }
  await remove(paths.folder(uid, folderId));
}

export const saveQuiz = (uid: string, quiz: Quiz) => set(paths.quiz(uid, quiz.id), { ...quiz, updatedAt: Date.now() });
export const deleteQuiz = (uid: string, quizId: string) => remove(paths.quiz(uid, quizId));
export const moveQuiz = (uid: string, quizId: string, folderId: string) =>
  update(paths.quiz(uid, quizId), { folderId: folderId || '', updatedAt: Date.now() });

export async function duplicateQuiz(uid: string, quiz: Quiz) {
  const copy = clone(quiz);
  copy.id = genId();
  copy.title = (quiz.title || 'Quiz') + ' Copy';
  copy.updatedAt = Date.now();
  (copy.questions || []).forEach((q) => {
    q.id = genId();
    (q.answers || []).forEach((a) => (a.id = genId()));
  });
  await set(paths.quiz(uid, copy.id), copy);
}

export async function importQuizList(uid: string, list: unknown[], settings: AppSettings) {
  const updates: Record<string, Quiz> = {};
  list.forEach((item) => {
    const q = normalizeImportedQuiz(item, settings);
    updates[q.id] = q;
  });
  await update(paths.quizzes(uid), updates);
}

export function quizListFromBackup(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  const quizzes = (parsed as { quizzes?: unknown })?.quizzes;
  return Array.isArray(quizzes) ? quizzes : [];
}

export function makeExportPayload(user: User | null, quizzes: Quiz[], folders: Folder[]) {
  return {
    app: 'TapBlast',
    type: 'tapblast_quiz_export',
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: user ? { uid: user.uid, email: user.email || '' } : null,
    quizzes: clone(quizzes),
    folders: clone(folders),
  };
}

/* ---------- sharing ---------- */

export interface SharedItem {
  id: string;
  fromUid: string;
  fromEmail: string;
  toEmail: string;
  quiz: Quiz;
  status: 'pending' | 'accepted' | 'declined';
  sharedAt: number;
}

export async function loadSharedInbox(email: string): Promise<SharedItem[]> {
  const val = (await get(paths.sharedInbox(email))).val() || {};
  return Object.entries(val as Record<string, SharedItem>)
    .map(([id, v]) => ({ ...v, id }))
    .sort((a, b) => (b.sharedAt || 0) - (a.sharedAt || 0));
}

export async function shareQuiz(from: User, toEmail: string, quiz: Quiz) {
  const itemId = genId();
  const copy = clone(quiz);
  copy.sharedOriginalId = quiz.id;
  await set(paths.sharedItem(toEmail, itemId), {
    id: itemId,
    fromUid: from.uid,
    fromEmail: from.email || '',
    toEmail: toEmail.toLowerCase(),
    quiz: copy,
    status: 'pending',
    sharedAt: Date.now(),
  });
}

export async function acceptShared(user: User, item: SharedItem) {
  const q = clone(item.quiz || defaultQuiz());
  q.id = genId();
  q.title = (q.title || 'Untitled Quiz') + ' copy';
  q.folderId = '';
  q.updatedAt = Date.now();
  await set(paths.quiz(user.uid, q.id), q);
  await update(paths.sharedItem(user.email || '', item.id), { status: 'accepted', decidedAt: Date.now() });
}

export const declineShared = (user: User, item: SharedItem) =>
  update(paths.sharedItem(user.email || '', item.id), { status: 'declined', decidedAt: Date.now() });

/* ---------- library cache (instant load while syncing) ---------- */

const cacheKey = (uid: string) => `tapblast_clean_v1_library_cache_${uid}`;

export function readLibraryCache(uid: string): { quizzes: Quiz[]; folders: Folder[] } | null {
  try {
    const data = JSON.parse(localStorage.getItem(cacheKey(uid)) || 'null');
    if (!data || !Array.isArray(data.quizzes) || !Array.isArray(data.folders)) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeLibraryCache(uid: string, quizzes: Quiz[], folders: Folder[]) {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify({ cachedAt: Date.now(), quizzes, folders }));
  } catch (err) {
    console.warn('Library cache write failed:', err);
  }
}
