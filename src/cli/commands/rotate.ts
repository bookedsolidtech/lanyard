import { execFileSync, spawnSync } from 'node:child_process';
import { loadAccounts } from '../../config/accounts.js';
import {
  keychainSetRaw,
  rawCredentialHasToken,
  readClaudeCodeCredentialRaw,
  writeClaudeCodeCredential,
} from '../../platform/keychain.js';
import { buildLoginEnv } from '../utils.js';

export function accountRotate(args: string[]): void {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    process.stderr.write('Usage: lanyard rotate <name>\n');
    process.exit(1);
  }

  const config = loadAccounts();
  const account = config.accounts[name];
  if (!account) {
    process.stderr.write(`Account "${name}" not found. Run: lanyard list\n`);
    process.exit(1);
  }

  process.stdout.write(`\nRotating credential for: ${name}\n`);
  process.stdout.write('Step 1: Backing up current Claude Code credential...\n');

  let backupRaw: string | null = null;
  try {
    backupRaw = execFileSync(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' },
    ).trim();
  } catch {
    /* no existing credential */
  }

  process.stdout.write('Step 2: Opening browser for OAuth login...\n');
  process.stdout.write(`  Log in with the account for "${name}".\n`);

  const loginResult = spawnSync('claude', ['auth', 'login'], {
    stdio: 'inherit',
    env: buildLoginEnv(),
  });
  if (loginResult.status !== 0) {
    process.stderr.write('\nOAuth login failed.\n');
    if (backupRaw) writeClaudeCodeCredential(backupRaw);
    process.exit(1);
  }

  const newCredentialRaw = readClaudeCodeCredentialRaw();
  if (!newCredentialRaw || !rawCredentialHasToken(newCredentialRaw)) {
    process.stderr.write('Failed to read new credential.\n');
    if (backupRaw) writeClaudeCodeCredential(backupRaw);
    process.exit(1);
  }

  process.stdout.write('Step 3: Updating keychain entry...\n');
  keychainSetRaw(account.keychain_service, newCredentialRaw);

  if (backupRaw) {
    process.stdout.write('Step 4: Restoring original credential...\n');
    writeClaudeCodeCredential(backupRaw);
  }

  process.stdout.write(`\nCredential for "${name}" rotated successfully.\n\n`);
}
