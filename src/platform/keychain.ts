import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';
import type { AccountCredential } from '../types/accounts.js';
import { IDENTITY_MARKER, KEYCHAIN_ACCOUNT } from '../config/paths.js';

const CC_KEYCHAIN_SERVICE = 'Claude Code-credentials';

/** Store a raw JSON string in macOS Keychain. Preserves all OAuth fields. */
export function keychainSetRaw(service: string, data: string): void {
  execFileSync(
    'security',
    ['add-generic-password', '-s', service, '-a', KEYCHAIN_ACCOUNT, '-w', data, '-U'],
    { stdio: 'pipe' },
  );
}

/** Retrieve the raw JSON string from macOS Keychain. */
export function keychainGetRaw(service: string): string | null {
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-s', service, '-a', KEYCHAIN_ACCOUNT, '-w'],
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' },
    );
    return raw.trim();
  } catch {
    return null;
  }
}

export function keychainDelete(service: string): boolean {
  try {
    execFileSync('security', ['delete-generic-password', '-s', service, '-a', KEYCHAIN_ACCOUNT], {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

export function keychainExists(service: string): boolean {
  try {
    execFileSync('security', ['find-generic-password', '-s', service, '-a', KEYCHAIN_ACCOUNT], {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/** Read the raw JSON blob from Claude Code's keychain entry. */
export function readClaudeCodeCredentialRaw(): string | null {
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-s', CC_KEYCHAIN_SERVICE, '-a', userInfo().username, '-w'],
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' },
    );
    return raw.trim();
  } catch {
    return null;
  }
}

/** Write a raw blob back to Claude Code's keychain entry. */
export function writeClaudeCodeCredential(data: string): void {
  execFileSync(
    'security',
    [
      'add-generic-password',
      '-s',
      CC_KEYCHAIN_SERVICE,
      '-a',
      userInfo().username,
      '-w',
      data,
      '-U',
    ],
    { stdio: 'pipe' },
  );
}

/**
 * Parse a raw credential blob (full Claude Code wrapper or bare inner) into
 * normalized fields. For display, health checks. NEVER for storage — that path
 * uses the raw blob to preserve OAuth refresh metadata.
 */
export function parseCredentialForDisplay(raw: string): AccountCredential | null {
  try {
    const parsed = JSON.parse(raw);
    const inner = parsed.claudeAiOauth || parsed;
    if (!inner || typeof inner !== 'object') return null;
    const cred = normalizeCredential(inner as Record<string, unknown>);
    if (!cred.accessToken) return null;
    return cred;
  } catch {
    return null;
  }
}

export function rawCredentialHasToken(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    const inner = parsed.claudeAiOauth || parsed;
    return !!(inner?.accessToken || inner?.oauth_token);
  } catch {
    return false;
  }
}

/** Wrap a bare inner credential as `{ claudeAiOauth: {...} }` if needed. */
export function ensureClaudeCodeWrapper(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.claudeAiOauth) return raw;
    if (parsed.accessToken || parsed.oauth_token) {
      return JSON.stringify({ claudeAiOauth: parsed });
    }
    return raw;
  } catch {
    return raw;
  }
}

function normalizeCredential(inner: Record<string, unknown>): AccountCredential {
  return {
    accessToken: (inner.accessToken || inner.oauth_token) as string,
    refreshToken: (inner.refreshToken || inner.refresh_token) as string | undefined,
    expiresAt: (inner.expiresAt || inner.expiry) as string | number | undefined,
    scopes: inner.scopes as string[] | undefined,
    subscriptionType: inner.subscriptionType as string | undefined,
    rateLimitTier: inner.rateLimitTier as string | undefined,
  };
}

export function extractRefreshToken(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw);
    const inner = parsed.claudeAiOauth || parsed;
    return (inner?.refreshToken as string) || null;
  } catch {
    return null;
  }
}

/**
 * Merge a lanyard account credential into Claude Code's keychain slot.
 * Overlays `claudeAiOauth` while preserving sibling keys (mcpOAuth) and
 * injecting the identity marker that prevents cross-account contamination.
 */
export function mergeIntoClaudeCodeSlot(accountCred: string, accountName: string): void {
  const incoming = JSON.parse(ensureClaudeCodeWrapper(accountCred));

  let existing: Record<string, unknown> = {};
  const currentRaw = readClaudeCodeCredentialRaw();
  if (currentRaw) {
    try {
      existing = JSON.parse(currentRaw);
    } catch {
      existing = {};
    }
  }

  const merged = {
    ...existing,
    claudeAiOauth: incoming.claudeAiOauth,
    [IDENTITY_MARKER]: accountName,
  };

  writeClaudeCodeCredential(JSON.stringify(merged));
}
