import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpRoot: string;
let dataDir: string;
let stdout: string[];

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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-whoami-'));
  dataDir = path.join(tmpRoot, 'data');
  stdout = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

function setupCC(blob: string | null): void {
  mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
    if (cmd !== 'security') throw new Error(`unexpected: ${cmd}`);
    if (args[0] === 'find-generic-password') {
      if (blob == null) throw new Error('not found');
      return blob;
    }
    return '';
  });
}

describe('accountWhoami', () => {
  it('reports "no account active" when neither marker nor file is set', async () => {
    setupCC(null);
    const { accountWhoami } = await import('../../../cli/commands/whoami.js');
    accountWhoami([]);
    expect(stdout.join('')).toContain('No lanyard account active');
  });

  it('--short emits empty line when no account is active', async () => {
    setupCC(null);
    const { accountWhoami } = await import('../../../cli/commands/whoami.js');
    accountWhoami(['--short']);
    expect(stdout.join('')).toBe('\n');
  });

  it('reads the active account from the Claude Code keychain marker', async () => {
    const { saveAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        work: {
          credential_store: 'keychain',
          keychain_service: 'lanyard-work',
          description: 'Work Max',
        },
      },
    });
    setupCC(JSON.stringify({ claudeAiOauth: { accessToken: 'x' }, _lanyardAccount: 'work' }));

    const { accountWhoami } = await import('../../../cli/commands/whoami.js');
    accountWhoami([]);
    const out = stdout.join('');
    expect(out).toContain('Account:  work');
    expect(out).toContain('Work Max');
    expect(out).toContain('Active');
  });

  it('--short prints just the account name when active', async () => {
    setupCC(JSON.stringify({ _lanyardAccount: 'personal' }));
    const { accountWhoami } = await import('../../../cli/commands/whoami.js');
    accountWhoami(['--short']);
    expect(stdout.join('').trim()).toBe('personal');
  });

  it('falls back to the active-account file when CC marker is absent', async () => {
    setupCC(JSON.stringify({ claudeAiOauth: { accessToken: 'x' } })); // no marker
    const { setActiveAccount } = await import('../../../cli/state.js');
    setActiveAccount('work');
    const { saveAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        work: { credential_store: 'keychain', keychain_service: 'lanyard-work' },
      },
    });

    const { accountWhoami } = await import('../../../cli/commands/whoami.js');
    accountWhoami([]);
    const out = stdout.join('');
    expect(out).toContain('Account:  work');
    expect(out).toContain('marker missing');
  });

  it('warns when the file and the marker disagree, trusts the marker', async () => {
    setupCC(JSON.stringify({ _lanyardAccount: 'work' }));
    const { setActiveAccount } = await import('../../../cli/state.js');
    setActiveAccount('personal');
    const { saveAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        personal: { credential_store: 'keychain', keychain_service: 'lanyard-personal' },
        work: { credential_store: 'keychain', keychain_service: 'lanyard-work' },
      },
    });

    const { accountWhoami } = await import('../../../cli/commands/whoami.js');
    accountWhoami([]);
    const out = stdout.join('');
    expect(out).toContain('Account:  work');
    expect(out).toContain('active-account file says "personal"');
    expect(out).toContain('Trusting Claude Code keychain');
  });
});
