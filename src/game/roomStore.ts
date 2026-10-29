import { get, onValue, runTransaction, serverTimestamp, update, child, type DatabaseReference } from 'firebase/database';
import { genId, clone } from '../lib/util';
import type { Room } from './types';

/**
 * Where a hosted game's room lives. Live games use Firebase; the editor's
 * Preview button uses an in-memory room. Host logic is written once against
 * this interface and works for both.
 */
export interface RoomStore {
  /** Fresh copy of the room straight from the source of truth. */
  read(): Promise<Room | null>;
  /** Multi-path update, e.g. {'phase': 'locked', 'players/abc/score': 900}. null deletes. */
  update(updates: Record<string, unknown>): Promise<void>;
  /** Returns true for exactly one caller per question index (prevents double scoring). */
  claimScoring(questionIndex: number): Promise<boolean>;
  /** Timestamp value to write (server time for Firebase). */
  timestamp(): unknown;
  newId(): string;
  subscribe(cb: (room: Room | null) => void, onError?: (err: Error) => void): () => void;
}

export class FirebaseRoomStore implements RoomStore {
  constructor(private readonly ref: DatabaseReference) {}

  async read(): Promise<Room | null> {
    const snap = await get(this.ref);
    return snap.exists() ? (snap.val() as Room) : null;
  }

  async update(updates: Record<string, unknown>): Promise<void> {
    await update(this.ref, updates);
  }

  async claimScoring(questionIndex: number): Promise<boolean> {
    const res = await runTransaction(child(this.ref, 'scoredQ'), (v) => (v === questionIndex ? undefined : questionIndex));
    return res.committed;
  }

  timestamp(): unknown {
    return serverTimestamp();
  }

  newId(): string {
    return genId();
  }

  subscribe(cb: (room: Room | null) => void, onError?: (err: Error) => void): () => void {
    return onValue(this.ref, (snap) => cb(snap.exists() ? (snap.val() as Room) : null), onError);
  }
}

/** Applies a Firebase-style multi-path update to a plain object. */
export function applyUpdates<T extends object>(target: T, updates: Record<string, unknown>): T {
  const next = clone(target) as Record<string, unknown>;
  Object.entries(updates).forEach(([path, value]) => {
    const parts = path.split('/').filter(Boolean);
    let node = next;
    for (let i = 0; i < parts.length - 1; i++) {
      if (node[parts[i]] == null || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined) delete node[last];
    else node[last] = clone(value);
  });
  return next as T;
}

export class LocalRoomStore implements RoomStore {
  private room: Room;
  private listeners = new Set<(room: Room | null) => void>();
  private scoredQ = -1;

  constructor(room: Room) {
    this.room = room;
  }

  async read(): Promise<Room | null> {
    return clone(this.room);
  }

  async update(updates: Record<string, unknown>): Promise<void> {
    this.room = applyUpdates(this.room, updates);
    const snapshot = clone(this.room);
    this.listeners.forEach((cb) => cb(snapshot));
  }

  async claimScoring(questionIndex: number): Promise<boolean> {
    if (this.scoredQ === questionIndex) return false;
    this.scoredQ = questionIndex;
    return true;
  }

  timestamp(): unknown {
    return Date.now();
  }

  newId(): string {
    return genId();
  }

  subscribe(cb: (room: Room | null) => void): () => void {
    this.listeners.add(cb);
    cb(clone(this.room));
    return () => this.listeners.delete(cb);
  }
}
