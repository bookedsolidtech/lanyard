import { loadAccounts } from '../config/accounts.js';
import { DEFAULT_KEYCHAIN_SERVICE, IDENTITY_MARKER } from '../config/paths.js';
import {
  extractRefreshToken,
  keychainGetRaw,
  keychainSetRaw,
  readClaudeCodeCredentialRaw,
} from '../platform/keychain.js';
import { getActiveAccount } from '../cli/state.js';

export type SyncResult = 'synced' | 'no-op' | 'skipped';

/**
 * Sync Claude Code's current keychain credential back to the previously
 * active lanyard account. Claude Code refreshes tokens in-place (rotating
 * refresh tokens) but only updates its own slot. Without this sync, our
 * stored copy goes stale and the next `use` writes a dead refresh token.
 *
 * Identity guard: refuses to overwrite if CC's slot belongs to a different
 * account (or to the default), so a manual `claude auth login` from another
 * shell can't contaminate our store.
 */
export function syncBackActiveCredential(): SyncResult {
  const prevName = getActiveAccount();
  if (!prevName) return 'no-op';

  const config = loadAccounts();
  const prevAccount = config.accounts[prevName];
  if (!prevAccount) return 'skipped';

  const currentRaw = readClaudeCodeCredentialRaw();
  if (!currentRaw) return 'skipped';

  try {
    const currentParsed = JSON.parse(currentRaw) as Record<string, unknown>;
    const marker = currentParsed[IDENTITY_MARKER];
    if (typeof marker === 'string' && marker !== prevName) {
      return 'no-op';
    }
    if (typeof marker !== 'string') {
      const defaultRaw = keychainGetRaw(DEFAULT_KEYCHAIN_SERVICE);
      if (defaultRaw) {
        const defaultRT = extractRefreshToken(defaultRaw);
        const currentRT = extractRefreshToken(currentRaw);
        if (defaultRT && currentRT && defaultRT === currentRT) {
          return 'no-op';
        }
      }
    }
  } catch {
    return 'skipped';
  }

  let cleanRaw = currentRaw;
  try {
    const parsed = JSON.parse(currentRaw) as Record<string, unknown>;
    if (IDENTITY_MARKER in parsed) {
      delete parsed[IDENTITY_MARKER];
      cleanRaw = JSON.stringify(parsed);
    }
  } catch {
    /* use as-is */
  }

  const storedRaw = keychainGetRaw(prevAccount.keychain_service);
  if (cleanRaw !== storedRaw) {
    keychainSetRaw(prevAccount.keychain_service, cleanRaw);
    return 'synced';
  }
  return 'no-op';
}
