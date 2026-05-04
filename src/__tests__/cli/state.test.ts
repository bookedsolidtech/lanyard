import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpRoot: string;
let dataDir: string;

vi.mock('env-paths', () => ({
  default: () => ({
    config: dataDir,
    data: dataDir,
    cache: dataDir,
    log: dataDir,
    temp: dataDir,
  }),
}));

beforeEach(() => {
  vi.resetModules();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-state-'));
  dataDir = path.join(tmpRoot, 'data');
});

afterEach(() => {
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe('active-account file', () => {
  it('returns null when file does not exist', async () => {
    const { getActiveAccount } = await import('../../cli/state.js');
    expect(getActiveAccount()).toBeNull();
  });

  it('round-trips a valid name', async () => {
    const { getActiveAccount, setActiveAccount } = await import('../../cli/state.js');
    setActiveAccount('work');
    expect(getActiveAccount()).toBe('work');
  });

  it('clear writes an empty file (returns null on read)', async () => {
    const { getActiveAccount, setActiveAccount } = await import('../../cli/state.js');
    setActiveAccount('work');
    setActiveAccount(null);
    expect(getActiveAccount()).toBeNull();
  });

  it('rejects names with invalid characters (returns null)', async () => {
    const { ACTIVE_ACCOUNT_PATH } = await import('../../config/paths.js');
    fs.mkdirSync(path.dirname(ACTIVE_ACCOUNT_PATH), { recursive: true });
    fs.writeFileSync(ACTIVE_ACCOUNT_PATH, 'NOT VALID\n');
    const { getActiveAccount } = await import('../../cli/state.js');
    expect(getActiveAccount()).toBeNull();
  });
});

describe('acquireSwitchLock', () => {
  it('acquires when no lock exists, releases on call', async () => {
    const { acquireSwitchLock } = await import('../../cli/state.js');
    const { SWITCH_LOCK_PATH } = await import('../../config/paths.js');
    const release = acquireSwitchLock();
    expect(release).not.toBeNull();
    expect(fs.existsSync(SWITCH_LOCK_PATH)).toBe(true);
    release?.();
    expect(fs.existsSync(SWITCH_LOCK_PATH)).toBe(false);
  });

  it('refuses a second concurrent acquire (returns null)', async () => {
    const { acquireSwitchLock } = await import('../../cli/state.js');
    const first = acquireSwitchLock();
    const second = acquireSwitchLock();
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    first?.();
  });

  it('cleans up a stale lock older than 30s and acquires', async () => {
    const { acquireSwitchLock } = await import('../../cli/state.js');
    const { SWITCH_LOCK_PATH } = await import('../../config/paths.js');
    fs.mkdirSync(path.dirname(SWITCH_LOCK_PATH), { recursive: true });
    fs.writeFileSync(SWITCH_LOCK_PATH, '');
    // Backdate the lock by 60s (well past the 30s stale threshold).
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(SWITCH_LOCK_PATH, past, past);

    const release = acquireSwitchLock();
    expect(release).not.toBeNull();
    release?.();
  });
});

describe('saveWrittenRefreshToken', () => {
  it('persists the refresh token to disk', async () => {
    const { saveWrittenRefreshToken } = await import('../../cli/state.js');
    const { WRITTEN_RT_PATH } = await import('../../config/paths.js');
    saveWrittenRefreshToken('rt-value');
    expect(fs.readFileSync(WRITTEN_RT_PATH, 'utf8')).toBe('rt-value');
  });
});
