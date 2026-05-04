import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpRoot: string;
let configDir: string;
let accountsPath: string;

vi.mock('env-paths', () => ({
  default: () => ({
    config: configDir,
    data: configDir,
    cache: configDir,
    log: configDir,
    temp: configDir,
  }),
}));

beforeEach(() => {
  vi.resetModules();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-accounts-'));
  configDir = path.join(tmpRoot, 'config');
  accountsPath = path.join(configDir, 'accounts.yaml');
});

afterEach(() => {
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe('loadAccounts / saveAccounts', () => {
  it('returns empty config when accounts.yaml does not exist', async () => {
    const { loadAccounts } = await import('../../config/accounts.js');
    expect(loadAccounts()).toEqual({ version: '1', accounts: {} });
  });

  it('round-trips a valid accounts file', async () => {
    const { loadAccounts, saveAccounts } = await import('../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        personal: {
          credential_store: 'keychain',
          keychain_service: 'lanyard-personal',
          description: 'Personal Claude Max',
        },
        work: {
          credential_store: 'keychain',
          keychain_service: 'lanyard-work',
        },
      },
    });
    const loaded = loadAccounts();
    expect(loaded.version).toBe('1');
    expect(loaded.accounts.personal?.description).toBe('Personal Claude Max');
    expect(loaded.accounts.work?.keychain_service).toBe('lanyard-work');
    expect(fs.existsSync(accountsPath)).toBe(true);
  });

  it('rejects accounts.yaml that contains an inline sk-ant-* token', async () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      accountsPath,
      'version: "1"\naccounts:\n  malicious:\n    credential_store: keychain\n    keychain_service: lanyard-malicious\n    description: "leaked sk-ant-fake-token-abcdef"\n',
    );
    const { loadAccounts } = await import('../../config/accounts.js');
    expect(() => loadAccounts()).toThrow(/inline token/i);
  });

  it('rejects malformed YAML with a clear error', async () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(accountsPath, 'this: is\n  not: valid:\n   - yaml: [\n');
    const { loadAccounts } = await import('../../config/accounts.js');
    expect(() => loadAccounts()).toThrow(/parse|invalid/i);
  });

  it('rejects schema-invalid accounts (wrong credential_store)', async () => {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      accountsPath,
      'version: "1"\naccounts:\n  bad:\n    credential_store: not-keychain\n    keychain_service: x\n',
    );
    const { loadAccounts } = await import('../../config/accounts.js');
    expect(() => loadAccounts()).toThrow(/Invalid accounts config/);
  });
});

describe('upsertAccount / removeAccount', () => {
  it('upsert adds and updates without overwriting siblings', async () => {
    const { upsertAccount, loadAccounts } = await import('../../config/accounts.js');
    upsertAccount('personal', {
      credential_store: 'keychain',
      keychain_service: 'lanyard-personal',
    });
    upsertAccount('work', {
      credential_store: 'keychain',
      keychain_service: 'lanyard-work',
    });
    upsertAccount('personal', {
      credential_store: 'keychain',
      keychain_service: 'lanyard-personal',
      description: 'updated',
    });
    const config = loadAccounts();
    expect(Object.keys(config.accounts).sort()).toEqual(['personal', 'work']);
    expect(config.accounts.personal?.description).toBe('updated');
  });

  it('removeAccount returns true on hit, false on miss; siblings preserved', async () => {
    const { upsertAccount, removeAccount, loadAccounts } = await import('../../config/accounts.js');
    upsertAccount('a', { credential_store: 'keychain', keychain_service: 'lanyard-a' });
    upsertAccount('b', { credential_store: 'keychain', keychain_service: 'lanyard-b' });
    expect(removeAccount('a')).toBe(true);
    expect(removeAccount('a')).toBe(false);
    expect(Object.keys(loadAccounts().accounts)).toEqual(['b']);
  });
});
