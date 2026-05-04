import { loadAccounts } from '../../config/accounts.js';
import { keychainGetRaw, parseCredentialForDisplay } from '../../platform/keychain.js';
import { fetchOAuthProfile, formatOrgType } from '../../oauth/profile.js';
import { getActiveAccount } from '../state.js';

export async function accountVerify(args: string[]): Promise<void> {
  const allFlag = args.includes('--all');
  const config = loadAccounts();
  const active = getActiveAccount();

  const names = allFlag ? Object.keys(config.accounts) : active ? [active] : [];

  if (names.length === 0) {
    if (allFlag) {
      process.stdout.write('\nNo accounts registered.\n\n');
    } else {
      process.stdout.write('\nNo active account. Use --all to verify all accounts.\n\n');
    }
    return;
  }

  process.stdout.write('\nAccount verification (via Anthropic API):\n\n');

  for (const name of names) {
    const account = config.accounts[name];
    if (!account) {
      process.stdout.write(`  ! ${name}: not found in accounts.yaml\n`);
      continue;
    }

    const credRaw = keychainGetRaw(account.keychain_service);
    const credential = credRaw ? parseCredentialForDisplay(credRaw) : null;
    if (!credential) {
      process.stdout.write(`  ! ${name}: keychain entry MISSING\n`);
      continue;
    }

    const profile = await fetchOAuthProfile(credential.accessToken);
    if (!profile) {
      process.stdout.write(`  ! ${name}: API request failed (token may be expired)\n`);
      process.stdout.write(`    Run: lanyard rotate ${name}\n`);
      continue;
    }

    const acct = profile.account || {};
    const org = profile.organization || {};

    process.stdout.write(`  + ${name}: VERIFIED\n`);
    process.stdout.write(`    Email:   ${acct.email || '?'}\n`);
    process.stdout.write(`    Name:    ${acct.display_name || '?'}\n`);
    process.stdout.write(`    Plan:    ${formatOrgType(org.organization_type)}\n`);
    process.stdout.write(`    Tier:    ${org.rate_limit_tier || '?'}\n`);
    process.stdout.write(`    Billing: ${org.billing_type || '?'}\n`);
  }
  process.stdout.write('\n');
}
