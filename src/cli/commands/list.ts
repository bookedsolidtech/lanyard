import { loadAccounts } from '../../config/accounts.js';
import { keychainExists } from '../../platform/keychain.js';
import { getActiveAccount } from '../state.js';

export function accountList(): void {
  const config = loadAccounts();
  const names = Object.keys(config.accounts);
  const active = getActiveAccount();

  if (names.length === 0) {
    process.stdout.write('\nNo accounts registered. Run: lanyard add <name>\n\n');
    return;
  }

  process.stdout.write('\nRegistered accounts:\n\n');
  for (const name of names) {
    const acct = config.accounts[name];
    if (!acct) continue;
    const isActive = active === name;
    const marker = isActive ? ' (active)' : '';
    const desc = acct.description ? ` — ${acct.description}` : '';
    const hasToken = keychainExists(acct.keychain_service) ? 'keychain ok' : 'keychain MISSING';
    process.stdout.write(`  ${isActive ? '*' : ' '} ${name}${marker}${desc}\n`);
    process.stdout.write(`    Store: ${hasToken} (${acct.keychain_service})\n`);
  }

  if (!active) {
    process.stdout.write('\n  No account active (Claude Code default in keychain)\n');
  }
  process.stdout.write('\n');
}

/** Plain list of account names, one per line — used by shell completions. */
export function accountListNames(): void {
  const names = Object.keys(loadAccounts().accounts);
  for (const name of names) {
    process.stdout.write(`${name}\n`);
  }
}
