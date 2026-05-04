import { loadAccounts, removeAccount as removeAccountConfig } from '../../config/accounts.js';
import { keychainDelete } from '../../platform/keychain.js';
import { getActiveAccount } from '../state.js';

export function accountRemove(args: string[]): void {
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    process.stderr.write('Usage: lanyard remove <name>\n');
    process.exit(1);
  }

  const config = loadAccounts();
  const account = config.accounts[name];
  if (!account) {
    process.stderr.write(`Account "${name}" not found.\n`);
    process.exit(1);
  }

  const deleted = keychainDelete(account.keychain_service);
  if (deleted) {
    process.stdout.write(`Deleted keychain entry: ${account.keychain_service}\n`);
  } else {
    process.stdout.write(`No keychain entry found for: ${account.keychain_service}\n`);
  }

  removeAccountConfig(name);
  process.stdout.write(`Removed "${name}" from accounts.yaml.\n`);

  if (getActiveAccount() === name) {
    process.stdout.write(
      `\nNote: "${name}" was the active account. Run: lanyard use --clear  to restore the default.\n`,
    );
  }
}
