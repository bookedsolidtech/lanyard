import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpRoot: string;
let dataDir: string;
let stdout: string[];
let stderr: string[];

vi.mock('env-paths', () => ({
  default: () => ({
    config: dataDir,
    data: dataDir,
    cache: dataDir,
    log: dataDir,
    temp: dataDir,
  }),
}));

const startDaemonMock = vi.fn();
const stopDaemonMock = vi.fn();

// Replace the real daemon module so we don't spawn a detached process.
vi.mock('../../../oauth/daemon.js', () => ({
  startCredentialSyncDaemon: () => startDaemonMock(),
  stopCredentialSyncDaemon: () => stopDaemonMock(),
  getDaemonPid: () => null,
  isDaemonRunning: () => false,
  SYNC_INTERVAL_MS: 45_000,
  SYNC_MAX_LIFETIME_MS: 8 * 60 * 60 * 1000,
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
  startDaemonMock.mockReset();
  stopDaemonMock.mockReset();
  mockExecFileSync.mockReset();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-use-'));
  dataDir = path.join(tmpRoot, 'data');
  stdout = [];
  stderr = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`__exit_${code ?? 0}__`);
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

/** Build a service-aware mock that responds based on the -s arg. */
function setupSecurity(initialReads: Record<string, string | null>) {
  const reads = { ...initialReads };
  const writes: Record<string, string> = {};
  mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
    if (cmd !== 'security') throw new Error(`unexpected cmd: ${cmd}`);
    const sIdx = args.indexOf('-s');
    const wIdx = args.indexOf('-w');
    const service = args[sIdx + 1];
    if (service === undefined) throw new Error('missing -s');
    if (args[0] === 'find-generic-password') {
      const value = reads[service];
      if (value == null) throw new Error(`not found: ${service}`);
      return value;
    }
    if (args[0] === 'add-generic-password') {
      writes[service] = args[wIdx + 1] ?? '';
      reads[service] = writes[service]!;
      return '';
    }
    if (args[0] === 'delete-generic-password') {
      delete reads[service];
      return '';
    }
    throw new Error(`unhandled args: ${args.join(' ')}`);
  });
  return { writes, reads };
}

async function seedAccounts() {
  const { saveAccounts } = await import('../../../config/accounts.js');
  saveAccounts({
    version: '1',
    accounts: {
      personal: {
        credential_store: 'keychain',
        keychain_service: 'lanyard-personal',
      },
      work: {
        credential_store: 'keychain',
        keychain_service: 'lanyard-work',
      },
    },
  });
}

const VALID_BLOB = JSON.stringify({
  claudeAiOauth: {
    accessToken: 'tok',
    refreshToken: 'rt',
    expiresAt: Date.now() + 60 * 60 * 1000,
    tokenEndpoint: 'https://api.anthropic.com/oauth/token',
  },
});

describe('lanyard use <name> — happy path', () => {
  it('switches: backs up default, merges into CC, sets active-account, starts daemon', async () => {
    await seedAccounts();
    const { writes, reads } = setupSecurity({
      'lanyard-work': VALID_BLOB,
      // Pre-existing CC credential (will be captured as default)
      'Claude Code-credentials': JSON.stringify({
        claudeAiOauth: { accessToken: 'pre-existing', refreshToken: 'rt0' },
      }),
    });
    const { accountUse } = await import('../../../cli/commands/use.js');
    accountUse(['work']);

    // Default backup written
    expect(writes['lanyard-__default__']).toBeDefined();
    // CC slot now holds the work credential with the lanyard marker
    const written = JSON.parse(writes['Claude Code-credentials']!);
    expect(written.claudeAiOauth.accessToken).toBe('tok');
    expect(written._lanyardAccount).toBe('work');

    // Active-account file updated
    const { getActiveAccount } = await import('../../../cli/state.js');
    expect(getActiveAccount()).toBe('work');

    // Daemon was started
    expect(startDaemonMock).toHaveBeenCalledOnce();
    expect(stdout.join('')).toContain('Switched to account: work');
    void reads;
  });

  it('does NOT re-backup the default on a subsequent switch (active-account file present)', async () => {
    await seedAccounts();
    const { setActiveAccount } = await import('../../../cli/state.js');
    setActiveAccount('personal'); // simulate prior switch

    const { writes } = setupSecurity({
      'lanyard-personal': VALID_BLOB,
      'lanyard-work': VALID_BLOB,
      'Claude Code-credentials': JSON.stringify({
        claudeAiOauth: { accessToken: 'currently-active', refreshToken: 'rt-active' },
        _lanyardAccount: 'personal',
      }),
    });
    const { accountUse } = await import('../../../cli/commands/use.js');
    accountUse(['work']);

    // No new default backup should have been created — but sync-back may
    // update lanyard-personal (the previously active account), and the CC
    // slot is rewritten to work. Accept any writes EXCEPT to __default__.
    expect(writes['lanyard-__default__']).toBeUndefined();
  });
});

describe('lanyard use <name> — failure paths', () => {
  it('rejects missing name with usage', async () => {
    setupSecurity({});
    const { accountUse } = await import('../../../cli/commands/use.js');
    expect(() => accountUse([])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('Usage: lanyard use');
  });

  it('rejects unknown account with "not found"', async () => {
    await seedAccounts();
    setupSecurity({});
    const { accountUse } = await import('../../../cli/commands/use.js');
    expect(() => accountUse(['ghost'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('not found');
  });

  it('rejects when the keychain entry is missing', async () => {
    await seedAccounts();
    setupSecurity({});
    const { accountUse } = await import('../../../cli/commands/use.js');
    expect(() => accountUse(['work'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('No credential found');
    expect(stderr.join('')).toContain('lanyard rotate work');
  });

  it('refuses to switch to an expired token', async () => {
    await seedAccounts();
    const expired = JSON.stringify({
      claudeAiOauth: {
        accessToken: 'tok',
        refreshToken: 'rt',
        expiresAt: Date.now() - 60_000,
      },
    });
    setupSecurity({ 'lanyard-work': expired });
    const { accountUse } = await import('../../../cli/commands/use.js');
    expect(() => accountUse(['work'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('EXPIRED');
    expect(stderr.join('')).toContain('lanyard rotate work');
  });
});

describe('lanyard use --clear', () => {
  it('restores the default credential, clears active-account, stops daemon', async () => {
    await seedAccounts();
    const { setActiveAccount } = await import('../../../cli/state.js');
    setActiveAccount('work');

    const defaultBlob = JSON.stringify({
      claudeAiOauth: { accessToken: 'orig', refreshToken: 'orig-rt' },
    });
    const { writes, reads } = setupSecurity({
      'lanyard-__default__': defaultBlob,
      'lanyard-work': VALID_BLOB,
      'Claude Code-credentials': JSON.stringify({
        claudeAiOauth: { accessToken: 'work-tok', refreshToken: 'work-rt' },
        _lanyardAccount: 'work',
      }),
    });
    const { accountUse } = await import('../../../cli/commands/use.js');
    accountUse(['--clear']);

    expect(stopDaemonMock).toHaveBeenCalled();
    expect(writes['Claude Code-credentials']).toBe(defaultBlob);

    const { getActiveAccount } = await import('../../../cli/state.js');
    expect(getActiveAccount()).toBeNull();
    void reads;
  });

  it('exits 1 when there is no saved default credential', async () => {
    setupSecurity({});
    const { accountUse } = await import('../../../cli/commands/use.js');
    expect(() => accountUse(['--clear'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('No saved default credential');
    expect(stderr.join('')).toContain('claude auth login');
  });
});

describe('lanyard use — concurrent switch lock', () => {
  it('refuses a second concurrent invocation while the lock is held', async () => {
    await seedAccounts();
    setupSecurity({ 'lanyard-work': VALID_BLOB });

    // Take the lock manually first.
    const { acquireSwitchLock } = await import('../../../cli/state.js');
    const release = acquireSwitchLock();
    expect(release).not.toBeNull();

    const { accountUse } = await import('../../../cli/commands/use.js');
    expect(() => accountUse(['work'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('Another switch is in progress');

    release?.();
  });
});
