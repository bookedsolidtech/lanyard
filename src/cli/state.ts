import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  ACTIVE_ACCOUNT_PATH,
  DATA_DIR,
  SWITCH_LOCK_PATH,
  WRITTEN_RT_PATH,
} from '../config/paths.js';
import { isValidAccountName } from './utils.js';

const LOCK_STALE_MS = 30_000;

function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

export function getActiveAccount(): string | null {
  try {
    const name = readFileSync(ACTIVE_ACCOUNT_PATH, 'utf8').trim();
    if (!name || !isValidAccountName(name)) return null;
    return name;
  } catch {
    return null;
  }
}

export function setActiveAccount(name: string | null): void {
  try {
    ensureDataDir();
    writeFileSync(ACTIVE_ACCOUNT_PATH, name || '', 'utf8');
  } catch {
    /* best-effort */
  }
}

export function saveWrittenRefreshToken(rt: string): void {
  try {
    ensureDataDir();
    writeFileSync(WRITTEN_RT_PATH, rt, 'utf8');
  } catch {
    /* best-effort */
  }
}

/**
 * Acquire an exclusive advisory file lock for switch operations. Returns
 * a release function, or null if another switch is in progress.
 */
export function acquireSwitchLock(): (() => void) | null {
  ensureDataDir();
  try {
    const st = statSync(SWITCH_LOCK_PATH);
    if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
      unlinkSync(SWITCH_LOCK_PATH);
    }
  } catch {
    /* no lock file or stat failed — fine */
  }
  try {
    const fd = openSync(SWITCH_LOCK_PATH, 'wx');
    return () => {
      try {
        closeSync(fd);
      } catch {
        /* already closed */
      }
      try {
        unlinkSync(SWITCH_LOCK_PATH);
      } catch {
        /* already removed */
      }
    };
  } catch {
    return null;
  }
}

export function lockfilePathSummary(): string {
  return path.relative(DATA_DIR, SWITCH_LOCK_PATH);
}
