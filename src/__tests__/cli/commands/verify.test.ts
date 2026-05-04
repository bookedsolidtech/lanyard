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

const fetchProfileMock = vi.fn();
vi.mock('../../../oauth/profile.js', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../../../oauth/profile.js');
  return {
    ...actual,
    fetchOAuthProfile: (token: string) => fetchProfileMock(token),
  };
});

beforeEach(() => {
  vi.resetModules();
  mockExecFileSync.mockReset();
  fetchProfileMock.mockReset();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-verify-'));
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

function setupSecurity(reads: Record<string, string | null>) {
  mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
    if (cmd !== 'security') throw new Error(`unexpected: ${cmd}`);
    const sIdx = args.indexOf('-s');
    const service = args[sIdx + 1];
    if (service === undefined) throw new Error('missing -s');
    if (args[0] === 'find-generic-password') {
      const value = reads[service];
      if (value == null) throw new Error(`not found: ${service}`);
      return value;
    }
    return '';
  });
}

const VALID_BLOB = JSON.stringify({
  claudeAiOauth: {
    accessToken: 'tok',
    refreshToken: 'rt',
    expiresAt: Date.now() + 60 * 60 * 1000,
  },
});

describe('accountVerify', () => {
  it('without --all and with no active account, prints a hint', async () => {
    setupSecurity({});
    const { accountVerify } = await import('../../../cli/commands/verify.js');
    await accountVerify([]);
    expect(stdout.join('')).toContain('No active account');
  });

  it('with --all and no accounts, reports nothing to verify', async () => {
    setupSecurity({});
    const { accountVerify } = await import('../../../cli/commands/verify.js');
    await accountVerify(['--all']);
    expect(stdout.join('')).toContain('No accounts registered');
  });

  it('passes the access token to fetchOAuthProfile and prints VERIFIED on success', async () => {
    const { saveAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        work: { credential_store: 'keychain', keychain_service: 'lanyard-work' },
      },
    });
    const { setActiveAccount } = await import('../../../cli/state.js');
    setActiveAccount('work');
    setupSecurity({ 'lanyard-work': VALID_BLOB });
    fetchProfileMock.mockResolvedValueOnce({
      account: { email: 'jane@example.com', display_name: 'Jane Doe' },
      organization: {
        organization_type: 'claude_max',
        rate_limit_tier: 'max_5',
        billing_type: 'paid',
      },
    });

    const { accountVerify } = await import('../../../cli/commands/verify.js');
    await accountVerify([]);

    expect(fetchProfileMock).toHaveBeenCalledWith('tok');
    const out = stdout.join('');
    expect(out).toContain('+ work: VERIFIED');
    expect(out).toContain('jane@example.com');
    expect(out).toContain('Jane Doe');
    expect(out).toContain('Max');
    expect(out).toContain('max_5');
    expect(out).toContain('paid');
  });

  it('prints failure when the API call returns null (likely expired)', async () => {
    const { saveAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        work: { credential_store: 'keychain', keychain_service: 'lanyard-work' },
      },
    });
    const { setActiveAccount } = await import('../../../cli/state.js');
    setActiveAccount('work');
    setupSecurity({ 'lanyard-work': VALID_BLOB });
    fetchProfileMock.mockResolvedValueOnce(null);

    const { accountVerify } = await import('../../../cli/commands/verify.js');
    await accountVerify([]);
    const out = stdout.join('');
    expect(out).toContain('! work: API request failed');
    expect(out).toContain('lanyard rotate work');
  });

  it('reports MISSING for a known account with no keychain entry', async () => {
    const { saveAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        gone: { credential_store: 'keychain', keychain_service: 'lanyard-gone' },
      },
    });
    setupSecurity({});
    const { accountVerify } = await import('../../../cli/commands/verify.js');
    await accountVerify(['--all']);
    expect(stdout.join('')).toContain('! gone: keychain entry MISSING');
    expect(fetchProfileMock).not.toHaveBeenCalled();
  });

  it('iterates --all in registry order', async () => {
    const { saveAccounts } = await import('../../../config/accounts.js');
    saveAccounts({
      version: '1',
      accounts: {
        a: { credential_store: 'keychain', keychain_service: 'lanyard-a' },
        b: { credential_store: 'keychain', keychain_service: 'lanyard-b' },
      },
    });
    setupSecurity({ 'lanyard-a': VALID_BLOB, 'lanyard-b': VALID_BLOB });
    fetchProfileMock.mockResolvedValue({
      account: { email: 'x@example.com' },
      organization: { organization_type: 'claude_pro' },
    });
    const { accountVerify } = await import('../../../cli/commands/verify.js');
    await accountVerify(['--all']);
    expect(fetchProfileMock).toHaveBeenCalledTimes(2);
    expect(stdout.join('')).toMatch(/a: VERIFIED[\s\S]+b: VERIFIED/);
  });
});
