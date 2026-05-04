#!/usr/bin/env node
import { accountAdd } from './commands/add.js';
import { accountCheck } from './commands/check.js';
import { accountCompletions } from './commands/completions.js';
import { accountDaemon } from './commands/daemon.js';
import { accountList, accountListNames } from './commands/list.js';
import { accountRemove } from './commands/remove.js';
import { accountRotate } from './commands/rotate.js';
import { accountUse } from './commands/use.js';
import { accountVerify } from './commands/verify.js';
import { accountWhoami } from './commands/whoami.js';

function printHelp(): void {
  process.stdout.write(
    [
      'lanyard — switch between Claude OAuth accounts',
      '',
      'Usage:',
      '  lanyard <command> [args]',
      '',
      'Commands:',
      '  add <name>             Authenticate and store a new account',
      '  list                   List registered accounts',
      '  use <name>             Make <name> the active account',
      '  use --clear            Restore the default account',
      '  whoami [--short]       Show the active account',
      '  check [--all]          Validate token expiry and keychain access',
      '  verify [--all]         Confirm tokens are live against the API',
      '  rotate <name>          Re-authenticate an existing account',
      '  remove <name>          Delete an account from keychain and config',
      '  completions install    Install shell completions (zsh/bash/fish)',
      '  completions uninstall  Remove installed completions',
      '  daemon status          Show credential-sync daemon state',
      '',
      'lanyard never modifies your shell rc files.',
      '',
    ].join('\n'),
  );
}

function platformGuard(cmd: string): void {
  if (process.platform === 'darwin') return;
  // Read-only commands that don't touch macOS Keychain may still work in part,
  // but safer to fail clearly. v1 is macOS only.
  process.stderr.write(
    `lanyard: "${cmd}" requires macOS Keychain. Linux/Windows backends are not yet implemented.\n` +
      '         Track support at https://github.com/bookedsolidtech/lanyard/issues\n',
  );
  process.exit(2);
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    printHelp();
    return 0;
  }
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    process.stdout.write('0.0.0\n');
    return 0;
  }

  switch (cmd) {
    case 'add':
      platformGuard(cmd);
      accountAdd(rest);
      return 0;
    case 'list':
      if (rest.includes('--names')) {
        accountListNames();
        return 0;
      }
      accountList();
      return 0;
    case 'use':
      platformGuard(cmd);
      accountUse(rest);
      return 0;
    case 'whoami':
      platformGuard(cmd);
      accountWhoami(rest);
      return 0;
    case 'check':
      platformGuard(cmd);
      accountCheck(rest);
      return 0;
    case 'verify':
      platformGuard(cmd);
      await accountVerify(rest);
      return 0;
    case 'rotate':
      platformGuard(cmd);
      accountRotate(rest);
      return 0;
    case 'remove':
      platformGuard(cmd);
      accountRemove(rest);
      return 0;
    case 'completions':
      accountCompletions(rest);
      return 0;
    case 'daemon':
      platformGuard(cmd);
      accountDaemon(rest);
      return 0;
    default:
      process.stderr.write(`lanyard: unknown command "${cmd}"\n\n`);
      printHelp();
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`lanyard: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
