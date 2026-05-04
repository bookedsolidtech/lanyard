import { loadAccounts } from '../../config/accounts.js';
import { IDENTITY_MARKER } from '../../config/paths.js';
import { readClaudeCodeCredentialRaw } from '../../platform/keychain.js';
import { getActiveAccount } from '../state.js';

export function accountWhoami(args: string[]): void {
  const shortFlag = args.includes('--short');

  const ccMarker = readMarkerFromCC();
  const fileActive = getActiveAccount();
  const active = ccMarker || fileActive;

  if (shortFlag) {
    process.stdout.write(`${active || ''}\n`);
    return;
  }

  if (!active) {
    process.stdout.write('\nNo lanyard account active.\n');
    process.stdout.write('Using Claude Code default (keychain credential).\n\n');
    return;
  }

  const config = loadAccounts();
  const account = config.accounts[active];
  const desc = account?.description || '(no description)';

  process.stdout.write('\n');
  process.stdout.write(`Account:  ${active}\n`);
  process.stdout.write(`Billing:  ${desc}\n`);
  if (ccMarker && fileActive && ccMarker !== fileActive) {
    process.stdout.write(
      `Note:     active-account file says "${fileActive}" but Claude Code keychain says "${ccMarker}".\n`,
    );
    process.stdout.write(
      '          Trusting Claude Code keychain. Run `lanyard use --clear` to reset.\n',
    );
  } else if (!ccMarker && fileActive) {
    process.stdout.write(
      'Note:     identity marker missing in Claude Code keychain — `claude auth login` may have run elsewhere.\n',
    );
  }
  process.stdout.write('Status:   Active (keychain swap)\n');
  process.stdout.write('\n');
}

function readMarkerFromCC(): string | null {
  const raw = readClaudeCodeCredentialRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const marker = parsed[IDENTITY_MARKER];
    return typeof marker === 'string' ? marker : null;
  } catch {
    return null;
  }
}
