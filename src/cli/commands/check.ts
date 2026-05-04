import { loadAccounts } from '../../config/accounts.js';
import { keychainGetRaw, parseCredentialForDisplay } from '../../platform/keychain.js';
import { getActiveAccount } from '../state.js';
import { tokenPreview } from '../utils.js';

export function accountCheck(args: string[]): void {
  const allFlag = args.includes('--all');
  const config = loadAccounts();
  const active = getActiveAccount();

  const names = allFlag ? Object.keys(config.accounts) : active ? [active] : [];

  if (names.length === 0) {
    if (allFlag) {
      process.stdout.write('\nNo accounts registered.\n\n');
    } else {
      process.stdout.write('\nNo active account. Use --all to check all accounts.\n\n');
    }
    return;
  }

  process.stdout.write('\nAccount health check:\n\n');

  for (const name of names) {
    const account = config.accounts[name];
    if (!account) {
      process.stdout.write(`  ! ${name}: not found in accounts.yaml\n`);
      continue;
    }

    const credRaw = keychainGetRaw(account.keychain_service);
    const credential = credRaw ? parseCredentialForDisplay(credRaw) : null;
    if (!credential) {
      process.stdout.write(`  ! ${name}: keychain entry MISSING (${account.keychain_service})\n`);
      continue;
    }

    const hasAccess = !!credential.accessToken;
    const hasRefresh = !!credential.refreshToken;
    const expiry = credential.expiresAt ? new Date(credential.expiresAt) : null;
    const isExpired = expiry ? expiry < new Date() : false;
    const status = !hasAccess ? 'NO TOKEN' : isExpired ? 'EXPIRED' : 'ok';

    process.stdout.write(`  ${status === 'ok' ? '+' : '!'} ${name}: ${status}\n`);
    process.stdout.write(`    Token:   ${tokenPreview(credential.accessToken)}\n`);
    process.stdout.write(`    Refresh: ${hasRefresh ? 'present' : 'none'}\n`);
    if (expiry) {
      process.stdout.write(
        `    Expires: ${expiry.toISOString()}${isExpired ? ' (EXPIRED)' : ''}\n`,
      );
    }
    if (credential.subscriptionType) {
      process.stdout.write(
        `    Plan:    ${credential.subscriptionType}${
          credential.rateLimitTier ? ` (${credential.rateLimitTier})` : ''
        }\n`,
      );
    }
  }
  process.stdout.write('\n');
}
