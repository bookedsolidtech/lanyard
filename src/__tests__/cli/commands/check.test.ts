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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lanyard-check-'));
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

async function seed(twoAccounts = true) {
  const { saveAccounts } = await import('../../../config/accounts.js');
  saveAccounts({
    version: '1',
    accounts: twoAccounts
      ? {
          personal: { credential_store: 'keychain', keychain_service: 'lanyard-personal' },
          work: { credential_store: 'keychain', keychain_service: 'lanyard-work' },
        }
      : {
          work: { credential_store: 'keychain', keychain_service: 'lanyard-work' },
        },
  });
}

const futureExpiry = Date.now() + 60 * 60 * 1000;
const pastExpiry = Date.now() - 60 * 1000;

describe('accountCheck — argument handling', () => {
  it('reports "no accounts registered" with --all on empty config', async () => {
    setupSecurity({});
    const { accountCheck } = await import('../../../cli/commands/check.js');
    accountCheck(['--all']);
    expect(stdout.join('')).toContain('No accounts registered');
  });

  it('reports "no active account" without --all when nothing is active', async () => {
    await seed();
    setupSecurity({});
    const { accountCheck } = await import('../../../cli/commands/check.js');
    accountCheck([]);
    expect(stdout.join('')).toContain('No active account');
  });
});

describe('accountCheck — single account', () => {
  it('reports ok for a healthy token (active account, no --all)', async () => {
    await seed();
    const { setActiveAccount } = await import('../../../cli/state.js');
    setActiveAccount('work');
    setupSecurity({
      'lanyard-work': JSON.stringify({
        claudeAiOauth: {
          accessToken: 'sk-ant-oat01-abcd-XYZ-1234',
          refreshToken: 'rt',
          expiresAt: futureExpiry,
          subscriptionType: 'claude_max',
          rateLimitTier: 'max_5',
        },
      }),
    });
    const { accountCheck } = await import('../../../cli/commands/check.js');
    accountCheck([]);
    const out = stdout.join('');
    expect(out).toContain('+ work: ok');
    expect(out).toContain('Token:   sk-ant-...1234'); // last 4 chars
    expect(out).toContain('Refresh: present');
    expect(out).toContain('claude_max');
    expect(out).toContain('max_5');
  });

  it('reports EXPIRED for a past expiry', async () => {
    await seed();
    const { setActiveAccount } = await import('../../../cli/state.js');
    setActiveAccount('work');
    setupSecurity({
      'lanyard-work': JSON.stringify({
        claudeAiOauth: {
          accessToken: 'tok',
          refreshToken: 'rt',
          expiresAt: pastExpiry,
        },
      }),
    });
    const { accountCheck } = await import('../../../cli/commands/check.js');
    accountCheck([]);
    expect(stdout.join('')).toContain('! work: EXPIRED');
  });

  it('reports keychain MISSING when there is no entry', async () => {
    await seed();
    const { setActiveAccount } = await import('../../../cli/state.js');
    setActiveAccount('work');
    setupSecurity({});
    const { accountCheck } = await import('../../../cli/commands/check.js');
    accountCheck([]);
    expect(stdout.join('')).toContain('! work: keychain entry MISSING');
  });
});

describe('accountCheck --all', () => {
  it('reports each account in turn with mixed health', async () => {
    await seed();
    setupSecurity({
      'lanyard-personal': JSON.stringify({
        claudeAiOauth: { accessToken: 'tok-ok', refreshToken: 'rt', expiresAt: futureExpiry },
      }),
      // work missing entirely
    });
    const { accountCheck } = await import('../../../cli/commands/check.js');
    accountCheck(['--all']);
    const out = stdout.join('');
    expect(out).toContain('+ personal: ok');
    expect(out).toContain('! work: keychain entry MISSING');
  });
});
