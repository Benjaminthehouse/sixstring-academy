/**
 * Safe key-value persistence. ALL browser storage in the app goes through here.
 *
 * localStorage can be missing, empty or throw (private windows, blocked site data, artifact
 * previews), so every access is wrapped and falls back to an in-memory map: the app keeps working
 * for the session even when nothing can be saved.
 */
const PREFIX = 'ssa:';
const memory = new Map<string, string>();

function ls(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readRaw(key: string): string | null {
  const k = PREFIX + key;
  try {
    const v = ls()?.getItem(k);
    if (v != null) return v;
  } catch {
    /* fall through to memory */
  }
  return memory.get(k) ?? null;
}

export function writeRaw(key: string, value: string): boolean {
  const k = PREFIX + key;
  memory.set(k, value);
  try {
    const s = ls();
    if (!s) return false;
    s.setItem(k, value);
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  const k = PREFIX + key;
  memory.delete(k);
  try {
    ls()?.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function readJSON<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    return writeRaw(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

/** Every stored key (without the prefix). Used by export/import and reset. */
export function keys(): string[] {
  const out = new Set<string>();
  for (const k of memory.keys()) out.add(k.slice(PREFIX.length));
  try {
    const s = ls();
    if (s) {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(PREFIX)) out.add(k.slice(PREFIX.length));
      }
    }
  } catch {
    /* ignore */
  }
  return [...out];
}

/** True when values actually survive a reload (false in the memory fallback). */
export function isPersistent(): boolean {
  try {
    const s = ls();
    if (!s) return false;
    s.setItem(PREFIX + '__probe', '1');
    s.removeItem(PREFIX + '__probe');
    return true;
  } catch {
    return false;
  }
}
