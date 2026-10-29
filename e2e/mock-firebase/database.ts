// Test double for firebase/database: the whole tree lives in localStorage
// ('mockdb'), and other tabs see changes through the 'storage' event, so a host
// tab and several player tabs can play a real game against each other.
type Json = unknown;
const KEY = 'mockdb';
const load = (): Record<string, Json> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
};
const save = (t: Json) => localStorage.setItem(KEY, JSON.stringify(t));
const split = (p: string) => String(p || '').split('/').filter(Boolean);
const getAt = (t: Json, parts: string[]): Json => {
  let n = t as Record<string, Json> | null;
  for (const k of parts) {
    if (n == null || typeof n !== 'object') return null;
    n = n[k] as Record<string, Json>;
  }
  return n === undefined ? null : n;
};
const resolve = (v: Json): Json => {
  if (v && typeof v === 'object') {
    if ((v as Record<string, Json>)['.sv'] === 'timestamp') return Date.now();
    const o: Record<string, Json> = Array.isArray(v) ? ([] as unknown as Record<string, Json>) : {};
    for (const k in v as Record<string, Json>) o[k] = resolve((v as Record<string, Json>)[k]);
    return o;
  }
  return v === undefined ? null : v;
};
const prune = (v: Json): Json => {
  if (v && typeof v === 'object') {
    const obj = v as Record<string, Json>;
    for (const k of Object.keys(obj)) {
      obj[k] = prune(obj[k]);
      if (obj[k] === null && !Array.isArray(v)) delete obj[k];
    }
    if (!Array.isArray(v) && Object.keys(obj).length === 0) return null;
  }
  return v;
};
const setAt = (t: Record<string, Json>, parts: string[], val: Json): Record<string, Json> => {
  if (!parts.length) return (prune(val) as Record<string, Json>) || {};
  let n = t;
  for (let i = 0; i < parts.length - 1; i++) {
    if (n[parts[i]] == null || typeof n[parts[i]] !== 'object') n[parts[i]] = {};
    n = n[parts[i]] as Record<string, Json>;
  }
  const pv = prune(val);
  if (pv === null) delete n[parts[parts.length - 1]];
  else n[parts[parts.length - 1]] = pv;
  return (prune(t) as Record<string, Json>) || {};
};

export interface DatabaseReference {
  key: string | null;
  path: string[];
}
export interface DataSnapshot {
  key: string | null;
  exists(): boolean;
  val(): any;
}
const snap = (key: string | null, v: Json): DataSnapshot => ({
  key,
  exists: () => v !== null && v !== undefined,
  val: () => (v == null ? null : JSON.parse(JSON.stringify(v))),
});

const listeners: { path: string[]; cb: (s: DataSnapshot) => void; last?: string }[] = [];
function notify() {
  const t = load();
  listeners.slice().forEach((l) => {
    const v = getAt(t, l.path);
    const j = JSON.stringify(v);
    if (j !== l.last) {
      l.last = j;
      l.cb(snap(l.path[l.path.length - 1] || null, v));
    }
  });
}
window.addEventListener('storage', (e) => e.key === KEY && notify());
const tick = () => new Promise((r) => setTimeout(r, 15));

export const getDatabase = (_app?: unknown) => ({});
export const ref = (_db: unknown, path = ''): DatabaseReference => {
  const p = split(path);
  return { key: p[p.length - 1] || null, path: p };
};
export const child = (r: DatabaseReference, path: string): DatabaseReference => {
  const p = r.path.concat(split(path));
  return { key: p[p.length - 1] || null, path: p };
};
export const push = (r: DatabaseReference) => child(r, 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
export const serverTimestamp = () => ({ '.sv': 'timestamp' });
export async function set(r: DatabaseReference, v: Json) {
  await tick();
  save(setAt(load(), r.path, resolve(v)));
  notify();
}
export async function update(r: DatabaseReference, obj: Record<string, Json>) {
  await tick();
  let t = load();
  for (const k in obj) t = setAt(t, r.path.concat(split(k)), resolve(obj[k]));
  save(t);
  notify();
}
export async function remove(r: DatabaseReference) {
  await tick();
  save(setAt(load(), r.path, null));
  notify();
}
export async function get(r: DatabaseReference) {
  await tick();
  return snap(r.key, getAt(load(), r.path));
}
export function onValue(r: DatabaseReference, cb: (s: DataSnapshot) => void, _err?: (e: Error) => void) {
  const l = { path: r.path, cb };
  listeners.push(l);
  setTimeout(notify, 5);
  return () => {
    const i = listeners.indexOf(l);
    if (i >= 0) listeners.splice(i, 1);
  };
}
export async function runTransaction(r: DatabaseReference, fn: (v: any) => any) {
  await tick();
  const t = load();
  const cur = getAt(t, r.path);
  const next = fn(cur == null ? null : JSON.parse(JSON.stringify(cur)));
  if (next === undefined) return { committed: false, snapshot: snap(r.key, cur) };
  save(setAt(t, r.path, resolve(next)));
  notify();
  return { committed: true, snapshot: snap(r.key, next) };
}
