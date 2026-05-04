import { afterEach, describe, expect, it, vi } from 'vitest';

const mockExecFileSync = vi.fn();

vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

vi.mock('node:os', () => ({
  userInfo: () => ({ username: 'testuser' }),
}));

const {
  keychainSetRaw,
  keychainGetRaw,
  keychainDelete,
  keychainExists,
  readClaudeCodeCredentialRaw,
  writeClaudeCodeCredential,
  parseCredentialForDisplay,
  rawCredentialHasToken,
  ensureClaudeCodeWrapper,
  extractRefreshToken,
  mergeIntoClaudeCodeSlot,
} = await import('../../platform/keychain.js');

const SERVICE = 'lanyard-personal';

describe('keychainSetRaw', () => {
  afterEach(() => mockExecFileSync.mockReset());

  it('uses atomic upsert (-U) so concurrent writes are safe', () => {
    mockExecFileSync.mockReturnValue('');
    keychainSetRaw(SERVICE, '{"accessToken":"tok"}');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'security',
      ['add-generic-password', '-s', SERVICE, '-a', 'lanyard', '-w', '{"accessToken":"tok"}', '-U'],
      { stdio: 'pipe' },
    );
  });

  it('propagates errors from `security`', () => {
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('add failed');
    });
    expect(() => keychainSetRaw(SERVICE, 'x')).toThrow('add failed');
  });
});

describe('keychainGetRaw', () => {
  afterEach(() => mockExecFileSync.mockReset());

  it('returns the stored blob exactly, trimmed', () => {
    const blob = '{"claudeAiOauth":{"accessToken":"tok","refreshToken":"r"}}';
    mockExecFileSync.mockReturnValue(blob + '\n');
    expect(keychainGetRaw(SERVICE)).toBe(blob);
  });

  it('returns null when entry is absent', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('SecKeychainSearchCopyNext');
    });
    expect(keychainGetRaw(SERVICE)).toBeNull();
  });
});

describe('keychainDelete / keychainExists', () => {
  afterEach(() => mockExecFileSync.mockReset());

  it('keychainDelete returns true on success, false on absence', () => {
    mockExecFileSync.mockReturnValueOnce('');
    expect(keychainDelete(SERVICE)).toBe(true);
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('not found');
    });
    expect(keychainDelete(SERVICE)).toBe(false);
  });

  it('keychainExists never reads the password (no -w flag)', () => {
    mockExecFileSync.mockReturnValueOnce('');
    expect(keychainExists(SERVICE)).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'security',
      ['find-generic-password', '-s', SERVICE, '-a', 'lanyard'],
      { stdio: 'pipe' },
    );
  });
});

describe('readClaudeCodeCredentialRaw', () => {
  afterEach(() => mockExecFileSync.mockReset());

  it('queries Claude Code under the OS username (matches Claude Code convention)', () => {
    mockExecFileSync.mockReturnValue('{"claudeAiOauth":{"accessToken":"tok"}}');
    readClaudeCodeCredentialRaw();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-a', 'testuser', '-w'],
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' },
    );
  });

  it('returns null when Claude Code has no credential', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });
    expect(readClaudeCodeCredentialRaw()).toBeNull();
  });
});

describe('writeClaudeCodeCredential', () => {
  afterEach(() => mockExecFileSync.mockReset());

  it('writes Claude Code slot with -U upsert under OS username', () => {
    mockExecFileSync.mockReturnValue('');
    writeClaudeCodeCredential('{"claudeAiOauth":{"accessToken":"x"}}');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'security',
      [
        'add-generic-password',
        '-s',
        'Claude Code-credentials',
        '-a',
        'testuser',
        '-w',
        '{"claudeAiOauth":{"accessToken":"x"}}',
        '-U',
      ],
      { stdio: 'pipe' },
    );
  });
});

describe('parseCredentialForDisplay', () => {
  it('unwraps the claudeAiOauth envelope', () => {
    const result = parseCredentialForDisplay(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'tok',
          refreshToken: 'ref',
          expiresAt: 1776151881800,
          scopes: ['user:inference'],
          subscriptionType: 'claude_max',
          rateLimitTier: 'max_5',
        },
      }),
    );
    expect(result).toMatchObject({
      accessToken: 'tok',
      refreshToken: 'ref',
      expiresAt: 1776151881800,
      scopes: ['user:inference'],
      subscriptionType: 'claude_max',
      rateLimitTier: 'max_5',
    });
  });

  it('falls back to legacy oauth_token field names', () => {
    const result = parseCredentialForDisplay(
      JSON.stringify({
        oauth_token: 'legacy',
        refresh_token: 'rt',
        expiry: '2026-01-01T00:00:00Z',
      }),
    );
    expect(result).toEqual({
      accessToken: 'legacy',
      refreshToken: 'rt',
      expiresAt: '2026-01-01T00:00:00Z',
      scopes: undefined,
      subscriptionType: undefined,
      rateLimitTier: undefined,
    });
  });

  it('returns null for malformed JSON', () => {
    expect(parseCredentialForDisplay('{{not-json')).toBeNull();
  });

  it('returns null for blobs missing an access token', () => {
    expect(parseCredentialForDisplay(JSON.stringify({ refreshToken: 'r' }))).toBeNull();
  });
});

describe('rawCredentialHasToken', () => {
  it('detects access token through the envelope', () => {
    expect(rawCredentialHasToken(JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }))).toBe(
      true,
    );
  });
  it('detects access token in bare format', () => {
    expect(rawCredentialHasToken(JSON.stringify({ accessToken: 'x' }))).toBe(true);
  });
  it('detects legacy oauth_token', () => {
    expect(rawCredentialHasToken(JSON.stringify({ oauth_token: 'x' }))).toBe(true);
  });
  it('returns false for empty objects', () => {
    expect(rawCredentialHasToken('{}')).toBe(false);
  });
  it('returns false for malformed JSON', () => {
    expect(rawCredentialHasToken('{{')).toBe(false);
  });
});

describe('ensureClaudeCodeWrapper', () => {
  it('leaves an already-wrapped blob unchanged', () => {
    const wrapped = JSON.stringify({ claudeAiOauth: { accessToken: 'x' } });
    expect(ensureClaudeCodeWrapper(wrapped)).toBe(wrapped);
  });

  it('wraps a bare inner blob with claudeAiOauth', () => {
    const bare = JSON.stringify({ accessToken: 'x', refreshToken: 'r' });
    expect(JSON.parse(ensureClaudeCodeWrapper(bare))).toEqual({
      claudeAiOauth: { accessToken: 'x', refreshToken: 'r' },
    });
  });

  it('wraps a legacy oauth_token blob too', () => {
    const legacy = JSON.stringify({ oauth_token: 'x' });
    expect(JSON.parse(ensureClaudeCodeWrapper(legacy))).toEqual({
      claudeAiOauth: { oauth_token: 'x' },
    });
  });

  it('returns malformed input unchanged (no throw)', () => {
    expect(ensureClaudeCodeWrapper('{{')).toBe('{{');
  });
});

describe('extractRefreshToken', () => {
  it('reads refreshToken from the claudeAiOauth envelope', () => {
    const blob = JSON.stringify({ claudeAiOauth: { accessToken: 'a', refreshToken: 'r' } });
    expect(extractRefreshToken(blob)).toBe('r');
  });
  it('reads refreshToken from a bare blob', () => {
    expect(extractRefreshToken(JSON.stringify({ refreshToken: 'r' }))).toBe('r');
  });
  it('returns null when missing', () => {
    expect(extractRefreshToken(JSON.stringify({ accessToken: 'a' }))).toBeNull();
  });
  it('returns null for malformed JSON', () => {
    expect(extractRefreshToken('{{')).toBeNull();
  });
});

describe('mergeIntoClaudeCodeSlot — preserves siblings + injects identity marker', () => {
  afterEach(() => mockExecFileSync.mockReset());

  it('overlays claudeAiOauth while keeping mcpOAuth and other top-level keys', () => {
    // Existing CC blob has mcpOAuth that we must NOT clobber.
    const existing = {
      claudeAiOauth: { accessToken: 'old-tok', refreshToken: 'old-rt' },
      mcpOAuth: { 'github.example': { token: 'mcp-token' } },
      somethingElse: { keep: 'me' },
    };
    // Read returns existing
    mockExecFileSync.mockReturnValueOnce(JSON.stringify(existing));
    // Write mock just returns
    mockExecFileSync.mockReturnValueOnce('');

    const incoming = JSON.stringify({
      claudeAiOauth: {
        accessToken: 'new-tok',
        refreshToken: 'new-rt',
        tokenEndpoint: 'https://api.anthropic.com/oauth/token',
      },
    });
    mergeIntoClaudeCodeSlot(incoming, 'work');

    // The second call (write) is the one we care about
    const writeCall = mockExecFileSync.mock.calls[1];
    expect(writeCall).toBeDefined();
    if (!writeCall) throw new Error('write call missing');
    const writtenArgs = writeCall[1] as string[];
    const writtenBlob = JSON.parse(writtenArgs[writtenArgs.indexOf('-w') + 1] as string);

    expect(writtenBlob).toEqual({
      claudeAiOauth: {
        accessToken: 'new-tok',
        refreshToken: 'new-rt',
        tokenEndpoint: 'https://api.anthropic.com/oauth/token',
      },
      mcpOAuth: { 'github.example': { token: 'mcp-token' } },
      somethingElse: { keep: 'me' },
      _lanyardAccount: 'work',
    });
  });

  it('handles the case where Claude Code slot is empty (no existing siblings)', () => {
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('not found');
    });
    mockExecFileSync.mockReturnValueOnce('');

    const incoming = JSON.stringify({ claudeAiOauth: { accessToken: 'x' } });
    mergeIntoClaudeCodeSlot(incoming, 'personal');

    const writeCall = mockExecFileSync.mock.calls[1];
    if (!writeCall) throw new Error('write call missing');
    const writtenArgs = writeCall[1] as string[];
    const writtenBlob = JSON.parse(writtenArgs[writtenArgs.indexOf('-w') + 1] as string);

    expect(writtenBlob).toEqual({
      claudeAiOauth: { accessToken: 'x' },
      _lanyardAccount: 'personal',
    });
  });

  it('wraps a bare incoming credential before merging', () => {
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('not found');
    });
    mockExecFileSync.mockReturnValueOnce('');

    const incomingBare = JSON.stringify({ accessToken: 'bare-tok', refreshToken: 'bare-rt' });
    mergeIntoClaudeCodeSlot(incomingBare, 'work');

    const writeCall = mockExecFileSync.mock.calls[1];
    if (!writeCall) throw new Error('write call missing');
    const writtenArgs = writeCall[1] as string[];
    const writtenBlob = JSON.parse(writtenArgs[writtenArgs.indexOf('-w') + 1] as string);

    expect(writtenBlob.claudeAiOauth).toEqual({
      accessToken: 'bare-tok',
      refreshToken: 'bare-rt',
    });
    expect(writtenBlob._lanyardAccount).toBe('work');
  });
});
