import { loadAccounts } from '../../config/accounts.js';
import { DEFAULT_KEYCHAIN_SERVICE } from '../../config/paths.js';
import {
  extractRefreshToken,
  keychainGetRaw,
  keychainSetRaw,
  mergeIntoClaudeCodeSlot,
  parseCredentialForDisplay,
  rawCredentialHasToken,
  readClaudeCodeCredentialRaw,
  writeClaudeCodeCredential,
} from '../../platform/keychain.js';
import { startCredentialSyncDaemon, stopCredentialSyncDaemon } from '../../oauth/daemon.js';
import { syncBackActiveCredential } from '../../oauth/sync.js';
import {
  acquireSwitchLock,
  getActiveAccount,
  saveWrittenRefreshToken,
  setActiveAccount,
} from '../state.js';

export function accountUse(args: string[]): void {
  const clearFlag = args.includes('--clear');

  const releaseLock = acquireSwitchLock();
  if (!releaseLock) {
    process.stderr.write('Another switch is in progress. Try again in a moment.\n');
    process.exit(1);
  }

  try {
    if (clearFlag) {
      stopCredentialSyncDaemon();
      const syncResult = syncBackActiveCredential();
      if (syncResult === 'skipped') {
        process.stderr.write('Warning: could not sync credential for previously active account.\n');
      }
      setActiveAccount(null);

      const defaultCredRaw = keychainGetRaw(DEFAULT_KEYCHAIN_SERVICE);
      if (!defaultCredRaw) {
        process.stderr.write('No saved default credential found.\n');
        process.stderr.write('Run: claude auth login  to establish a default session.\n');
        process.exit(1);
      }
      writeClaudeCodeCredential(defaultCredRaw);
      process.stdout.write('Restored default Claude Code credential.\n');
      process.stdout.write('Restart any active Claude Code sessions to pick up the change.\n');
      return;
    }

    const name = args.find((a) => !a.startsWith('--'));
    if (!name) {
      process.stderr.write('Usage: lanyard use <name> | lanyard use --clear\n');
      process.exit(1);
    }

    const config = loadAccounts();
    const account = config.accounts[name];
    if (!account) {
      process.stderr.write(`Account "${name}" not found. Run: lanyard list\n`);
      process.exit(1);
    }

    const syncResult = syncBackActiveCredential();
    if (syncResult === 'skipped') {
      process.stderr.write('Warning: could not sync credential for previously active account.\n');
    }

    const credentialRaw = keychainGetRaw(account.keychain_service);
    if (!credentialRaw || !rawCredentialHasToken(credentialRaw)) {
      process.stderr.write(`No credential found for "${name}". Run: lanyard rotate ${name}\n`);
      process.exit(1);
    }

    const credentialForDisplay = parseCredentialForDisplay(credentialRaw);
    if (credentialForDisplay?.expiresAt) {
      const expiresAt =
        typeof credentialForDisplay.expiresAt === 'number'
          ? credentialForDisplay.expiresAt
          : Date.parse(String(credentialForDisplay.expiresAt));
      if (expiresAt < Date.now()) {
        process.stderr.write(`⚠ Token for "${name}" is EXPIRED. Run: lanyard rotate ${name}\n`);
        process.exit(1);
      }
    }

    // Save current Claude Code credential as the default backup, but only on
    // first switch (active-account file is empty). This prevents storing a
    // switched account's credential as the default if a new terminal runs
    // `lanyard use` without first having run `lanyard use --clear`.
    if (!getActiveAccount()) {
      try {
        const currentRaw = readClaudeCodeCredentialRaw();
        if (currentRaw && rawCredentialHasToken(currentRaw)) {
          keychainSetRaw(DEFAULT_KEYCHAIN_SERVICE, currentRaw);
        }
      } catch {
        /* no existing credential — nothing to save */
      }
    }

    mergeIntoClaudeCodeSlot(credentialRaw, name);
    setActiveAccount(name);

    const writtenRT = extractRefreshToken(credentialRaw);
    if (writtenRT) saveWrittenRefreshToken(writtenRT);

    startCredentialSyncDaemon();

    process.stdout.write(`Switched to account: ${name}\n`);
    process.stdout.write('Restart any active Claude Code sessions to pick up the change.\n');
  } finally {
    releaseLock();
  }
}
