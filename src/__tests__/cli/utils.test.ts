import { describe, expect, it } from 'vitest';
import { buildLoginEnv, isValidAccountName, parseFlag, tokenPreview } from '../../cli/utils.js';

describe('parseFlag', () => {
  it('parses space-separated form: --shell zsh', () => {
    expect(parseFlag(['--shell', 'zsh'], '--shell')).toBe('zsh');
  });

  it('parses equals form: --shell=zsh', () => {
    expect(parseFlag(['--shell=zsh'], '--shell')).toBe('zsh');
  });

  it('returns null when flag is absent', () => {
    expect(parseFlag(['use', 'work'], '--shell')).toBeNull();
  });

  it('returns null when value is missing or another flag follows', () => {
    expect(parseFlag(['--shell'], '--shell')).toBeNull();
    expect(parseFlag(['--shell', '--other'], '--shell')).toBeNull();
  });

  it('preserves "=" inside the value when split form is used', () => {
    expect(parseFlag(['--filter=name=foo=bar'], '--filter')).toBe('name=foo=bar');
  });
});

describe('isValidAccountName', () => {
  it.each([
    ['personal', true],
    ['work-account', true],
    ['acct123', true],
    ['a', true],
    ['Personal', false], // uppercase
    ['-leading', false],
    ['has_underscore', false],
    ['has space', false],
    ['', false],
  ])('isValidAccountName(%j) === %j', (name, expected) => {
    expect(isValidAccountName(name)).toBe(expected);
  });
});

describe('tokenPreview', () => {
  it('shows last 4 chars after a redacted prefix', () => {
    expect(tokenPreview('sk-ant-oat01-abcdef-XYZ-1234')).toBe('sk-ant-...1234');
  });
  it('returns "none" for missing token', () => {
    expect(tokenPreview(undefined)).toBe('none');
  });
});

describe('buildLoginEnv', () => {
  it('strips inherited Claude OAuth env vars before claude auth login', () => {
    const original = process.env;
    try {
      process.env = {
        ...original,
        CLAUDE_CODE_OAUTH_TOKEN: 'tok',
        CLAUDE_CODE_OAUTH_REFRESH_TOKEN: 'ref',
        CLAUDE_CODE_OAUTH_SCOPES: 'user:inference',
        OTHER_VAR: 'keep-me',
      };
      const env = buildLoginEnv();
      expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
      expect(env.CLAUDE_CODE_OAUTH_REFRESH_TOKEN).toBeUndefined();
      expect(env.CLAUDE_CODE_OAUTH_SCOPES).toBeUndefined();
      expect(env.OTHER_VAR).toBe('keep-me');
    } finally {
      process.env = original;
    }
  });

  it('does not mutate process.env', () => {
    const original = process.env;
    try {
      process.env = { ...original, CLAUDE_CODE_OAUTH_TOKEN: 'tok' };
      buildLoginEnv();
      expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBe('tok');
    } finally {
      process.env = original;
    }
  });
});
