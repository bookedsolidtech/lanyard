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
vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

beforeEach(() => {
  vi.resetModules();
  mockExecFileSync.mockReset();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-remove-'));
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

describe('accountRemove', () => {
  it('rejects missing name argument', async () => {
    const { accountRemove } = await import('../../../cli/commands/remove.js');
    expect(() => accountRemove([])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('Usage: lanyard remove');
  });

  it('rejects unknown account name', async () => {
    const { accountRemove } = await import('../../../cli/commands/remove.js');
    expect(() => accountRemove(['ghost'])).toThrow(/__exit_1__/);
    expect(stderr.join('')).toContain('not found');
  });

  it('deletes keychain entry and removes from config', async () => {
    const { saveAccounts, loadAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        gone: { credential_store: 'keychain', keychain_service: 'lanyard-gone' },
        kept: { credential_store: 'keychain', keychain_service: 'lanyard-kept' },
      },
    });
    mockExecFileSync.mockImplementation(() => ''); // delete succeeds

    const { accountRemove } = await import('../../../cli/commands/remove.js');
    accountRemove(['gone']);

    const remaining = loadAccounts();
    expect(Object.keys(remaining.accounts)).toEqual(['kept']);
    const out = stdout.join('');
    expect(out).toContain('Deleted keychain entry: lanyard-gone');
    expect(out).toContain('Removed "gone" from accounts.yaml');

    // Confirm the security delete-generic-password call was made
    const deleteCall = mockExecFileSync.mock.calls.find(
      ([cmd, args]) =>
        cmd === 'security' && Array.isArray(args) && args[0] === 'delete-generic-password',
    );
    expect(deleteCall).toBeDefined();
  });

  it('still removes from yaml when the keychain entry is already gone', async () => {
    const { saveAccounts, loadAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        orphan: { credential_store: 'keychain', keychain_service: 'lanyard-orphan' },
      },
    });
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const { accountRemove } = await import('../../../cli/commands/remove.js');
    accountRemove(['orphan']);

    expect(Object.keys(loadAccounts().accounts)).toEqual([]);
    expect(stdout.join('')).toContain('No keychain entry found');
  });

  it('warns when removing the currently active account', async () => {
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

    const { accountRemove } = await import('../../../cli/commands/remove.js');
    accountRemove(['work']);

    const out = stdout.join('');
    expect(out).toContain('was the active account');
    expect(out).toContain('lanyard use --clear');
  });
});
