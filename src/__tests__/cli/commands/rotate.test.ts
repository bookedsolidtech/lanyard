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

const mockExecFileSync = vi.fn();
const mockSpawnSync = vi.fn();
vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
  spawnSync: (...args: unknown[]) => mockSpawnSync(...args),
}));

beforeEach(() => {
  vi.resetModules();
  mockExecFileSync.mockReset();
  mockSpawnSync.mockReset();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-rotate-'));
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

interface SecState {
  reads: Record<string, string | null>;
  writes: Record<string, string>;
}
function setupSecurity(initialReads: Record<string, string | null>): SecState {
  const state: SecState = { reads: { ...initialReads }, writes: {} };
  mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
    if (cmd !== 'security') throw new Error(`unexpected: ${cmd}`);
    const sIdx = args.indexOf('-s');
    const wIdx = args.indexOf('-w');
    const service = args[sIdx + 1];
    if (service === undefined) throw new Error('missing -s');
    if (args[0] === 'find-generic-password') {
      const value = state.reads[service];
      if (value == null) throw new Error(`not found: ${service}`);
      return value;
    }
    if (args[0] === 'add-generic-password') {
      const data = args[wIdx + 1] ?? '';
      state.writes[service] = data;
      state.reads[service] = data;
      return '';
    }
    throw new Error(`unhandled: ${args.join(' ')}`);
  });
  return state;
}

const NEW_CC_BLOB = JSON.stringify({
  claudeAiOauth: {
    accessToken: 'fresh-tok',
    refreshToken: 'fresh-rt',
    expiresAt: Date.now() + 60 * 60 * 1000,
  },
});

async function seedWork() {
  const { saveAccounts } = await import('../../../config/accounts.js');
  saveAccounts({
    version: '1',
    accounts: {
      work: { credential_store: 'keychain', keychain_service: 'lanyard-work' },
    },
  });
}

describe('accountRotate — argument validation', () => {
  it('rejects missing name', async () => {
    const { accountRotate } = await import('../../../cli/commands/rotate.js');
    expect(() => accountRotate([])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('Usage: lanyard rotate');
  });

  it('rejects unknown account', async () => {
    setupSecurity({});
    const { accountRotate } = await import('../../../cli/commands/rotate.js');
    expect(() => accountRotate(['ghost'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('not found');
  });
});

describe('accountRotate — happy path', () => {
  it('backs up CC, logs in, overwrites lanyard-<name>, restores CC', async () => {
    await seedWork();
    const ORIG = JSON.stringify({ claudeAiOauth: { accessToken: 'orig' } });
    const state = setupSecurity({
      'Claude Code-credentials': ORIG,
      'lanyard-work': JSON.stringify({ claudeAiOauth: { accessToken: 'old' } }),
    });
    mockSpawnSync.mockImplementation(() => {
      state.reads['Claude Code-credentials'] = NEW_CC_BLOB;
      return { status: 0 };
    });

    const { accountRotate } = await import('../../../cli/commands/rotate.js');
    accountRotate(['work']);

    // New credential captured under existing service
    expect(state.writes['lanyard-work']).toBe(NEW_CC_BLOB);
    // Backup restored to CC
    expect(state.writes['Claude Code-credentials']).toBe(ORIG);
    expect(stdout.join('')).toContain('Credential for "work" rotated successfully');
  });

  it('proceeds without restore when there was no original CC credential', async () => {
    await seedWork();
    const state = setupSecurity({
      'lanyard-work': JSON.stringify({ claudeAiOauth: { accessToken: 'old' } }),
    });
    mockSpawnSync.mockImplementation(() => {
      state.reads['Claude Code-credentials'] = NEW_CC_BLOB;
      return { status: 0 };
    });

    const { accountRotate } = await import('../../../cli/commands/rotate.js');
    accountRotate(['work']);

    expect(state.writes['lanyard-work']).toBe(NEW_CC_BLOB);
    // No restore should have happened
    expect(state.writes['Claude Code-credentials']).toBeUndefined();
  });
});

describe('accountRotate — failure paths', () => {
  it('exits 1 + restores backup when login fails', async () => {
    await seedWork();
    const ORIG = JSON.stringify({ claudeAiOauth: { accessToken: 'orig' } });
    const state = setupSecurity({
      'Claude Code-credentials': ORIG,
      'lanyard-work': JSON.stringify({ claudeAiOauth: { accessToken: 'old' } }),
    });
    mockSpawnSync.mockReturnValue({ status: 1 });

    const { accountRotate } = await import('../../../cli/commands/rotate.js');
    expect(() => accountRotate(['work'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('OAuth login failed');
    expect(state.writes['Claude Code-credentials']).toBe(ORIG);
    // The original lanyard-work entry must NOT have been overwritten
    expect(state.writes['lanyard-work']).toBeUndefined();
  });

  it('exits 1 + restores when CC has no token after login', async () => {
    await seedWork();
    const ORIG = JSON.stringify({ claudeAiOauth: { accessToken: 'orig' } });
    const state = setupSecurity({
      'Claude Code-credentials': ORIG,
      'lanyard-work': JSON.stringify({ claudeAiOauth: { accessToken: 'old' } }),
    });
    mockSpawnSync.mockImplementation(() => {
      state.reads['Claude Code-credentials'] = '{}';
      return { status: 0 };
    });

    const { accountRotate } = await import('../../../cli/commands/rotate.js');
    expect(() => accountRotate(['work'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('Failed to read new credential');
    expect(state.writes['Claude Code-credentials']).toBe(ORIG);
    expect(state.writes['lanyard-work']).toBeUndefined();
  });
});
