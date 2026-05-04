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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-add-'));
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

/**
 * Service-aware mock that lets a test pre-seed reads and observe writes.
 * Returned `state` lets the test mutate reads mid-flow (e.g., post-login
 * the CC slot now holds new credential).
 */
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
    if (args[0] === 'delete-generic-password') {
      delete state.reads[service];
      return '';
    }
    throw new Error(`unhandled: ${args.join(' ')}`);
  });
  return state;
}

const NEW_CC_BLOB = JSON.stringify({
  claudeAiOauth: {
    accessToken: 'new-tok',
    refreshToken: 'new-rt',
    expiresAt: Date.now() + 60 * 60 * 1000,
    tokenEndpoint: 'https://api.anthropic.com/oauth/token',
  },
});

describe('accountAdd — argument validation', () => {
  it('rejects missing name with usage', async () => {
    const { accountAdd } = await import('../../../cli/commands/add.js');
    expect(() => accountAdd([])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('Usage: lanyard add');
  });

  it('rejects names with uppercase or invalid characters', async () => {
    const { accountAdd } = await import('../../../cli/commands/add.js');
    expect(() => accountAdd(['Personal'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('lowercase alphanumeric');
  });

  it('rejects an already-registered name with a rotate hint', async () => {
    const { saveAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        work: { credential_store: 'keychain', keychain_service: 'lanyard-work' },
      },
    });
    setupSecurity({});
    const { accountAdd } = await import('../../../cli/commands/add.js');
    expect(() => accountAdd(['work'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('already exists');
    expect(stderr.join('')).toContain('lanyard rotate work');
  });
});

describe('accountAdd — happy path', () => {
  it('backs up CC, logs in, captures new credential, restores backup, upserts', async () => {
    // CC has a pre-existing credential we must preserve.
    const ORIG = JSON.stringify({ claudeAiOauth: { accessToken: 'orig', refreshToken: 'rt-0' } });
    const state = setupSecurity({ 'Claude Code-credentials': ORIG });
    // The login swaps CC's slot to the new account's credential.
    mockSpawnSync.mockImplementation((cmd: string, args: string[]) => {
      expect(cmd).toBe('claude');
      expect(args).toEqual(['auth', 'login']);
      // Simulate Claude Code writing the new credential to its keychain slot.
      state.reads['Claude Code-credentials'] = NEW_CC_BLOB;
      return { status: 0 };
    });

    const { accountAdd } = await import('../../../cli/commands/add.js');
    accountAdd(['personal']);

    // The new credential must have been stored under lanyard-personal
    expect(state.writes['lanyard-personal']).toBe(NEW_CC_BLOB);
    // The original CC credential must have been written back
    expect(state.writes['Claude Code-credentials']).toBe(ORIG);

    // accounts.yaml updated
    const { loadAccounts } = await import('../../../config/accounts.js');
    expect(loadAccounts().accounts.personal?.keychain_service).toBe('lanyard-personal');

    expect(stdout.join('')).toContain('Account "personal" registered successfully');
  });

  it('handles first-time setup (no existing CC credential)', async () => {
    const state = setupSecurity({});
    mockSpawnSync.mockImplementation(() => {
      state.reads['Claude Code-credentials'] = NEW_CC_BLOB;
      return { status: 0 };
    });

    const { accountAdd } = await import('../../../cli/commands/add.js');
    accountAdd(['personal']);

    // New credential stored
    expect(state.writes['lanyard-personal']).toBe(NEW_CC_BLOB);
    // No restore should have happened (Claude Code-credentials write count == 0)
    expect(state.writes['Claude Code-credentials']).toBeUndefined();
    expect(stdout.join('')).toContain('first-time setup');
  });
});

describe('accountAdd — failure paths', () => {
  it('exits 1 + restores backup when claude auth login fails', async () => {
    const ORIG = JSON.stringify({ claudeAiOauth: { accessToken: 'orig' } });
    const state = setupSecurity({ 'Claude Code-credentials': ORIG });
    mockSpawnSync.mockReturnValue({ status: 1 });

    const { accountAdd } = await import('../../../cli/commands/add.js');
    expect(() => accountAdd(['personal'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('OAuth login failed');
    // Backup was restored
    expect(state.writes['Claude Code-credentials']).toBe(ORIG);
    // No keychain entry was created for the failed account
    expect(state.writes['lanyard-personal']).toBeUndefined();
  });

  it('exits 1 + restores backup when CC keychain has no token after login', async () => {
    const ORIG = JSON.stringify({ claudeAiOauth: { accessToken: 'orig' } });
    const state = setupSecurity({ 'Claude Code-credentials': ORIG });
    mockSpawnSync.mockImplementation(() => {
      // Simulate a login that exits 0 but leaves no token (the user closed
      // the browser tab without finishing the flow, etc.)
      state.reads['Claude Code-credentials'] = JSON.stringify({});
      return { status: 0 };
    });

    const { accountAdd } = await import('../../../cli/commands/add.js');
    expect(() => accountAdd(['personal'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('Failed to read new credential');
    // Restore happened
    expect(state.writes['Claude Code-credentials']).toBe(ORIG);
    expect(state.writes['lanyard-personal']).toBeUndefined();
  });

  it('strips inherited CLAUDE_CODE_OAUTH_* env vars before claude auth login', async () => {
    const original = process.env;
    process.env = {
      ...original,
      CLAUDE_CODE_OAUTH_TOKEN: 'stale-tok',
      CLAUDE_CODE_OAUTH_REFRESH_TOKEN: 'stale-rt',
      CLAUDE_CODE_OAUTH_SCOPES: 'old:scope',
    };
    try {
      const state = setupSecurity({});
      mockSpawnSync.mockImplementation(() => {
        state.reads['Claude Code-credentials'] = NEW_CC_BLOB;
        return { status: 0 };
      });
      const { accountAdd } = await import('../../../cli/commands/add.js');
      accountAdd(['personal']);

      const spawnCall = mockSpawnSync.mock.calls[0];
      expect(spawnCall).toBeDefined();
      const opts = spawnCall![2] as { env: Record<string, string | undefined> };
      expect(opts.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
      expect(opts.env.CLAUDE_CODE_OAUTH_REFRESH_TOKEN).toBeUndefined();
      expect(opts.env.CLAUDE_CODE_OAUTH_SCOPES).toBeUndefined();
    } finally {
      process.env = original;
    }
  });
});
