import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, openSync, readSync } from 'node:fs';
import { loadAccounts, upsertAccount } from '../../config/accounts.js';
import { keychainServiceFor } from '../../config/paths.js';
import {
  keychainSetRaw,
  rawCredentialHasToken,
  readClaudeCodeCredentialRaw,
  writeClaudeCodeCredential,
} from '../../platform/keychain.js';
import { buildLoginEnv, isValidAccountName } from '../utils.js';

export function accountAdd(args: string[]): void {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    process.stderr.write('Usage: lanyard add <name>\n');
    process.exit(1);
  }
  if (!isValidAccountName(name)) {
    process.stderr.write(
      'Account name must be lowercase alphanumeric with hyphens (e.g., clarity-house)\n',
    );
    process.exit(1);
  }

  const keychainService = keychainServiceFor(name);
  const config = loadAccounts();
  if (config.accounts[name]) {
    process.stderr.write(
      `Account "${name}" already exists. Use 'lanyard rotate ${name}' to re-authenticate.\n`,
    );
    process.exit(1);
  }

  process.stdout.write(`\nRegistering account: ${name}\n`);
  process.stdout.write('Step 1: Backing up current Claude Code credential...\n');

  let backupRaw: string | null = null;
  try {
    backupRaw = execFileSync(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' },
    ).trim();
    process.stdout.write('  Backup saved.\n');
  } catch {
    process.stdout.write('  No existing Claude Code credential found (first-time setup).\n');
  }

  process.stdout.write('\nStep 2: Opening browser for OAuth login...\n');
  process.stdout.write(`  Log in with the account you want to register as "${name}".\n`);
  process.stdout.write('  Press Enter when ready, or Ctrl+C to cancel.\n');

  try {
    const fd = openSync('/dev/tty', 'r');
    const buf = Buffer.alloc(1);
    readSync(fd, buf, 0, 1, null);
    closeSync(fd);
  } catch {
    /* non-interactive — proceed */
  }

  const loginResult = spawnSync('claude', ['auth', 'login'], {
    stdio: 'inherit',
    env: buildLoginEnv(),
  });
  if (loginResult.status !== 0) {
    process.stderr.write('\nOAuth login failed or was cancelled.\n');
    if (backupRaw) {
      process.stdout.write('Restoring original credential...\n');
      writeClaudeCodeCredential(backupRaw);
    }
    process.exit(1);
  }

  process.stdout.write('\nStep 3: Reading new credential from keychain...\n');
  const newCredentialRaw = readClaudeCodeCredentialRaw();
  if (!newCredentialRaw || !rawCredentialHasToken(newCredentialRaw)) {
    process.stderr.write('Failed to read new credential from Claude Code keychain entry.\n');
    if (backupRaw) {
      process.stdout.write('Restoring original credential...\n');
      writeClaudeCodeCredential(backupRaw);
    }
    process.exit(1);
  }

  process.stdout.write('Step 4: Storing under lanyard keychain entry...\n');
  keychainSetRaw(keychainService, newCredentialRaw);

  process.stdout.write('Step 5: Restoring original Claude Code credential...\n');
  if (backupRaw) {
    writeClaudeCodeCredential(backupRaw);
    process.stdout.write('  Original credential restored.\n');
  } else {
    process.stdout.write('  No original credential to restore.\n');
  }

  process.stdout.write('Step 6: Updating accounts.yaml...\n');
  upsertAccount(name, {
    credential_store: 'keychain',
    keychain_service: keychainService,
  });

  process.stdout.write(`\nAccount "${name}" registered successfully.\n`);
  process.stdout.write(`To switch: lanyard use ${name}\n\n`);
}
