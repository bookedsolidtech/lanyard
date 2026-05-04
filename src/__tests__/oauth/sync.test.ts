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

const mockExecFileSync = vi.fn();
vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('node:os');
  return { ...actual, userInfo: () => ({ username: 'testuser' }) };
});

beforeEach(() => {
  vi.resetModules();
  mockExecFileSync.mockReset();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-sync-'));
  dataDir = path.join(tmpRoot, 'data');
});

afterEach(() => {
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

/**
 * Build a `security` mock that responds based on the service name argument.
 * Each call's args are inspected; reads return the matching map entry, writes
 * are recorded into `writes`.
 */
function setupSecurity(reads: Record<string, string | null>, writes: Record<string, string>) {
  mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
    if (cmd !== 'security') throw new Error(`unexpected command: ${cmd}`);
    const sIdx = args.indexOf('-s');
    const wIdx = args.indexOf('-w');
    const service = args[sIdx + 1];
    if (service === undefined) throw new Error('missing -s service in args');

    if (args[0] === 'find-generic-password') {
      const value = reads[service];
      if (value == null) throw new Error(`not found: ${service}`);
      return value;
    }
    if (args[0] === 'add-generic-password') {
      writes[service] = args[wIdx + 1] ?? '';
      return '';
    }
    throw new Error(`unhandled args: ${args.join(' ')}`);
  });
}

async function importSync() {
  return await import('../../oauth/sync.js');
}

async function setActive(name: string | null) {
  const { setActiveAccount } = await import('../../cli/state.js');
  setActiveAccount(name);
}

async function seedAccounts(): Promise<void> {
  const { saveAccounts } = await import('../../config/accounts.js');
  saveAccounts({
    version: '1',
    accounts: {
      personal: { credential_store: 'keychain', keychain_service: 'lanyard-personal' },
      work: { credential_store: 'keychain', keychain_service: 'lanyard-work' },
    },
  });
}

describe('syncBackActiveCredential', () => {
  it('returns "no-op" when no account is active', async () => {
    setupSecurity({}, {});
    const { syncBackActiveCredential } = await importSync();
    expect(syncBackActiveCredential()).toBe('no-op');
  });

  it('returns "skipped" when the active-account file points at an unknown account', async () => {
    await seedAccounts();
    await setActive('ghost');
    setupSecurity({ 'Claude Code-credentials': '{"claudeAiOauth":{"accessToken":"x"}}' }, {});
    const { syncBackActiveCredential } = await importSync();
    expect(syncBackActiveCredential()).toBe('skipped');
  });

  it('returns "skipped" when Claude Code keychain is empty', async () => {
    await seedAccounts();
    await setActive('work');
    setupSecurity({}, {});
    const { syncBackActiveCredential } = await importSync();
    expect(syncBackActiveCredential()).toBe('skipped');
  });

  it('refuses sync when CC marker names a different account (cross-account guard)', async () => {
    await seedAccounts();
    await setActive('work');
    const ccBlob = JSON.stringify({
      claudeAiOauth: { accessToken: 'tok', refreshToken: 'rt' },
      _lanyardAccount: 'personal', // wrong owner!
    });
    const writes: Record<string, string> = {};
    setupSecurity({ 'Claude Code-credentials': ccBlob }, writes);
    const { syncBackActiveCredential } = await importSync();
    expect(syncBackActiveCredential()).toBe('no-op');
    expect(writes['lanyard-work']).toBeUndefined();
  });

  it('refuses sync when CC has the default credential (matching default RT)', async () => {
    await seedAccounts();
    await setActive('work');
    const sharedRT = 'default-rt-value';
    const ccBlob = JSON.stringify({ claudeAiOauth: { accessToken: 'a', refreshToken: sharedRT } });
    const defaultBlob = JSON.stringify({ claudeAiOauth: { refreshToken: sharedRT } });
    const writes: Record<string, string> = {};
    setupSecurity(
      {
        'Claude Code-credentials': ccBlob,
        'lanyard-__default__': defaultBlob,
      },
      writes,
    );
    const { syncBackActiveCredential } = await importSync();
    expect(syncBackActiveCredential()).toBe('no-op');
    expect(writes['lanyard-work']).toBeUndefined();
  });

  it('returns "no-op" when stored credential matches CC (after marker strip)', async () => {
    await seedAccounts();
    await setActive('work');
    const inner = { accessToken: 'tok', refreshToken: 'rt' };
    const ccBlob = JSON.stringify({ claudeAiOauth: inner, _lanyardAccount: 'work' });
    const stored = JSON.stringify({ claudeAiOauth: inner });
    const writes: Record<string, string> = {};
    setupSecurity({ 'Claude Code-credentials': ccBlob, 'lanyard-work': stored }, writes);
    const { syncBackActiveCredential } = await importSync();
    expect(syncBackActiveCredential()).toBe('no-op');
    expect(writes['lanyard-work']).toBeUndefined();
  });

  it('syncs when CC differs (refresh token rotated), strips marker before storing', async () => {
    await seedAccounts();
    await setActive('work');
    const ccBlob = JSON.stringify({
      claudeAiOauth: { accessToken: 'new-tok', refreshToken: 'new-rt' },
      _lanyardAccount: 'work',
    });
    const stored = JSON.stringify({
      claudeAiOauth: { accessToken: 'old-tok', refreshToken: 'old-rt' },
    });
    const writes: Record<string, string> = {};
    setupSecurity({ 'Claude Code-credentials': ccBlob, 'lanyard-work': stored }, writes);
    const { syncBackActiveCredential } = await importSync();
    expect(syncBackActiveCredential()).toBe('synced');

    expect(writes['lanyard-work']).toBeDefined();
    const written = JSON.parse(writes['lanyard-work']!);
    expect(written.claudeAiOauth.refreshToken).toBe('new-rt');
    expect(written._lanyardAccount).toBeUndefined();
  });
});
