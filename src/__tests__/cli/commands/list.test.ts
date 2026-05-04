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

beforeEach(() => {
  vi.resetModules();
  mockExecFileSync.mockReset();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-list-'));
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

describe('accountList', () => {
  it('prints a "no accounts registered" message when empty', async () => {
    const { accountList } = await import('../../../cli/commands/list.js');
    accountList();
    const out = stdout.join('');
    expect(out).toContain('No accounts registered');
    expect(out).toContain('lanyard add <name>');
  });

  it('lists registered accounts with keychain status', async () => {
    const { saveAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        personal: {
          credential_store: 'keychain',
          keychain_service: 'lanyard-personal',
          description: 'Personal Max',
        },
        work: { credential_store: 'keychain', keychain_service: 'lanyard-work' },
      },
    });
    // exists succeeds for both
    mockExecFileSync.mockImplementation(() => '');

    const { accountList } = await import('../../../cli/commands/list.js');
    accountList();
    const out = stdout.join('');
    expect(out).toContain('personal');
    expect(out).toContain('work');
    expect(out).toContain('Personal Max');
    expect(out).toContain('keychain ok');
    expect(out).toContain('lanyard-personal');
  });

  it('marks the active account with a star', async () => {
    const { saveAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        work: { credential_store: 'keychain', keychain_service: 'lanyard-work' },
      },
    });
    const { setActiveAccount } = await import('../../../cli/state.js');
    setActiveAccount('work');
    mockExecFileSync.mockImplementation(() => '');

    const { accountList } = await import('../../../cli/commands/list.js');
    accountList();
    const out = stdout.join('');
    expect(out).toMatch(/\*\s+work\s+\(active\)/);
  });

  it('reports MISSING when the keychain entry is gone', async () => {
    const { saveAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        gone: { credential_store: 'keychain', keychain_service: 'lanyard-gone' },
      },
    });
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const { accountList } = await import('../../../cli/commands/list.js');
    accountList();
    expect(stdout.join('')).toContain('keychain MISSING');
  });
});

describe('accountListNames', () => {
  it('prints one name per line for completions', async () => {
    const { saveAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        a: { credential_store: 'keychain', keychain_service: 'lanyard-a' },
        b: { credential_store: 'keychain', keychain_service: 'lanyard-b' },
        c: { credential_store: 'keychain', keychain_service: 'lanyard-c' },
      },
    });
    const { accountListNames } = await import('../../../cli/commands/list.js');
    accountListNames();
    expect(stdout.join('').trim().split('\n').sort()).toEqual(['a', 'b', 'c']);
  });

  it('produces no output when there are no accounts', async () => {
    const { accountListNames } = await import('../../../cli/commands/list.js');
    accountListNames();
    expect(stdout.join('')).toBe('');
  });
});
