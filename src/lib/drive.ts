import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';

const TOKEN_KEY = 'tapblast_drive_token';
const FILE_NAME = 'tapblast_backup.json';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export function rememberDriveToken(token: string | undefined | null) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
}

async function ensureToken(): Promise<string> {
  const saved = sessionStorage.getItem(TOKEN_KEY);
  if (saved) return saved;
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  provider.setCustomParameters({ prompt: 'consent select_account' });
  const result = await signInWithPopup(auth, provider);
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error('Google Drive permission was not granted.');
  rememberDriveToken(token);
  return token;
}

async function driveFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await ensureToken();
  const res = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: 'Bearer ' + token } });
  if (res.status === 401 || res.status === 403) {
    sessionStorage.removeItem(TOKEN_KEY);
    throw new Error('Google Drive permission expired. Try again.');
  }
  return res;
}

export async function findBackupFile(): Promise<{ id: string } | null> {
  const q = encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)&pageSize=10`);
  if (!res.ok) throw new Error('Could not search Google Drive backup file.');
  const data = await res.json();
  return (data.files || [])[0] || null;
}

/** Creates tapblast_backup.json, or replaces it if it already exists. */
export async function uploadBackup(fileId: string | null, content: string): Promise<void> {
  if (fileId) {
    const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    });
    if (!res.ok) throw new Error('Could not update Google Drive backup.');
    return;
  }
  const boundary = 'tapblast_boundary_' + Date.now();
  const body = [
    '--' + boundary,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: FILE_NAME, mimeType: 'application/json' }),
    '--' + boundary,
    'Content-Type: application/json',
    '',
    content,
    '--' + boundary + '--',
  ].join('\r\n');
  const res = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body,
  });
  if (!res.ok) throw new Error('Could not create Google Drive backup.');
}

export async function downloadBackup(fileId: string): Promise<unknown> {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  if (!res.ok) throw new Error('Could not download Google Drive backup.');
  return JSON.parse(await res.text());
}
