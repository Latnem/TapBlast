// Test double for firebase/auth. The signed-in user is kept in localStorage
// ('mockUser') so a test can sign in with one line.
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
}
type Listener = (u: User | null) => void;
const listeners = new Set<Listener>();
const current = (): User | null => {
  try {
    return JSON.parse(localStorage.getItem('mockUser') || 'null');
  } catch {
    return null;
  }
};
const auth = { get currentUser() { return current(); } };
export const getAuth = (_app?: unknown) => auth;
export const browserLocalPersistence = 'local';
export const setPersistence = async (_a: unknown, _p: unknown) => {};
export function onAuthStateChanged(_a: unknown, cb: Listener) {
  listeners.add(cb);
  setTimeout(() => cb(current()), 0);
  return () => listeners.delete(cb);
}
export async function signInWithPopup(_a: unknown, _p: unknown) {
  const user = { uid: 'teacher1', email: 'teacher@test.dev', displayName: 'Test Teacher' };
  localStorage.setItem('mockUser', JSON.stringify(user));
  listeners.forEach((cb) => cb(user));
  return { user };
}
export async function signOut(_a: unknown) {
  localStorage.removeItem('mockUser');
  listeners.forEach((cb) => cb(null));
}
export class GoogleAuthProvider {
  addScope(_s: string) {}
  setCustomParameters(_p: unknown) {}
  static credentialFromResult(_r: unknown): { accessToken?: string } | null {
    return null;
  }
}
