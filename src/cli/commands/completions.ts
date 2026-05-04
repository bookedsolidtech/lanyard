import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseFlag } from '../utils.js';

type Shell = 'zsh' | 'bash' | 'fish';

export function accountCompletions(args: string[]): void {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'install':
      install(rest);
      return;
    case 'uninstall':
      uninstall(rest);
      return;
    case 'print':
      print(rest);
      return;
    default:
      process.stderr.write(
        'Usage:\n' +
          '  lanyard completions install [--shell <zsh|bash|fish>]\n' +
          '  lanyard completions uninstall [--shell <zsh|bash|fish>]\n' +
          '  lanyard completions print --shell <zsh|bash|fish>\n',
      );
      process.exit(1);
  }
}

function detectShell(): Shell {
  const sh = process.env.SHELL || '';
  if (sh.endsWith('/fish')) return 'fish';
  if (sh.endsWith('/bash')) return 'bash';
  return 'zsh';
}

function resolveShell(args: string[]): Shell {
  const flag = parseFlag(args, '--shell');
  if (flag === 'zsh' || flag === 'bash' || flag === 'fish') return flag;
  if (flag) {
    process.stderr.write(`Unsupported shell: ${flag}. Use zsh, bash, or fish.\n`);
    process.exit(1);
  }
  return detectShell();
}

interface InstallTarget {
  /** Where the completion file is written. */
  filePath: string;
  /** A user-facing note shown after install (or empty). */
  postInstallNote: string;
}

function targetFor(shell: Shell): InstallTarget {
  const xdgData = process.env.XDG_DATA_HOME || path.join(homedir(), '.local', 'share');
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config');

  if (shell === 'zsh') {
    const dir = path.join(xdgData, 'zsh', 'site-functions');
    const filePath = path.join(dir, '_lanyard');
    const postInstallNote = [
      "If completions don't work, ensure this line is in your ~/.zshrc once:",
      '',
      `  fpath=("${dir}" $fpath)`,
      '  autoload -Uz compinit && compinit',
      '',
      "lanyard does NOT modify your ~/.zshrc itself — that's the whole point.",
    ].join('\n');
    return { filePath, postInstallNote };
  }

  if (shell === 'bash') {
    const dir = path.join(xdgData, 'bash-completion', 'completions');
    const filePath = path.join(dir, 'lanyard');
    const postInstallNote = [
      'Most bash-completion installations source $XDG_DATA_HOME/bash-completion/completions/* automatically.',
      "If completions don't work, ensure bash-completion is installed and your shell is restarted.",
    ].join('\n');
    return { filePath, postInstallNote };
  }

  // fish
  const dir = path.join(xdgConfig, 'fish', 'completions');
  const filePath = path.join(dir, 'lanyard.fish');
  return {
    filePath,
    postInstallNote:
      'Fish auto-discovers completions in this directory — restart your shell or run `fish_update_completions`.',
  };
}

function install(args: string[]): void {
  const shell = resolveShell(args);
  const force = args.includes('--force');
  const { filePath, postInstallNote } = targetFor(shell);
  const script = scriptFor(shell);

  if (existsSync(filePath) && !force) {
    process.stderr.write(
      `Completion file already exists: ${filePath}\n` +
        '  Re-run with --force to overwrite, or `lanyard completions uninstall` first.\n',
    );
    process.exit(1);
  }

  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, script, { encoding: 'utf8', mode: 0o644 });
  process.stdout.write(`Installed ${shell} completion: ${filePath}\n`);
  if (postInstallNote) {
    process.stdout.write('\n');
    process.stdout.write(`${postInstallNote}\n`);
  }
}

function uninstall(args: string[]): void {
  const shell = resolveShell(args);
  const { filePath } = targetFor(shell);
  if (!existsSync(filePath)) {
    process.stdout.write(`No completion file at ${filePath} — nothing to remove.\n`);
    return;
  }
  unlinkSync(filePath);
  process.stdout.write(`Removed ${shell} completion: ${filePath}\n`);
}

function print(args: string[]): void {
  const shell = resolveShell(args);
  process.stdout.write(scriptFor(shell));
}

function scriptFor(shell: Shell): string {
  switch (shell) {
    case 'zsh':
      return ZSH_SCRIPT;
    case 'bash':
      return BASH_SCRIPT;
    case 'fish':
      return FISH_SCRIPT;
  }
}

const ZSH_SCRIPT = `#compdef lanyard

_lanyard() {
  local -a subcommands accounts
  subcommands=(
    'add:Authenticate and store a new account'
    'list:List registered accounts'
    'use:Make <name> the active account'
    'whoami:Show the active account'
    'check:Validate token expiry and keychain access'
    'verify:Confirm tokens are live against the API'
    'rotate:Re-authenticate an existing account'
    'remove:Delete an account from keychain and config'
    'completions:Manage shell completions'
    'daemon:Credential-sync daemon control'
  )

  if (( CURRENT == 2 )); then
    _describe 'command' subcommands
    return
  fi

  case "\${words[2]}" in
    use|whoami|check|verify|rotate|remove)
      accounts=(\${(f)"$(lanyard list --names 2>/dev/null)"})
      _describe 'account' accounts
      [[ "\${words[2]}" == "use" ]] && _values 'flag' '--clear'
      ;;
    completions)
      _values 'subcommand' install uninstall print
      _values 'shell' '--shell=zsh' '--shell=bash' '--shell=fish'
      ;;
    daemon)
      _values 'subcommand' status start stop
      ;;
  esac
}

compdef _lanyard lanyard
`;

const BASH_SCRIPT = `# bash completion for lanyard

_lanyard() {
  local cur prev words cword
  _init_completion || return

  if [[ \${cword} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "add list use whoami check verify rotate remove completions daemon" -- "\${cur}") )
    return
  fi

  local sub="\${words[1]}"
  case "\${sub}" in
    use|whoami|check|verify|rotate|remove)
      local accounts
      accounts=$(lanyard list --names 2>/dev/null)
      local extras=""
      [[ "\${sub}" == "use" ]] && extras="--clear"
      COMPREPLY=( $(compgen -W "\${accounts} \${extras}" -- "\${cur}") )
      ;;
    completions)
      COMPREPLY=( $(compgen -W "install uninstall print --shell" -- "\${cur}") )
      ;;
    daemon)
      COMPREPLY=( $(compgen -W "status start stop" -- "\${cur}") )
      ;;
  esac
}

complete -F _lanyard lanyard
`;

const FISH_SCRIPT = `# fish completion for lanyard

complete -c lanyard -f

set -l __lanyard_subs add list use whoami check verify rotate remove completions daemon
complete -c lanyard -n "not __fish_seen_subcommand_from $__lanyard_subs" -a "add" -d "Authenticate and store a new account"
complete -c lanyard -n "not __fish_seen_subcommand_from $__lanyard_subs" -a "list" -d "List registered accounts"
complete -c lanyard -n "not __fish_seen_subcommand_from $__lanyard_subs" -a "use" -d "Make <name> the active account"
complete -c lanyard -n "not __fish_seen_subcommand_from $__lanyard_subs" -a "whoami" -d "Show the active account"
complete -c lanyard -n "not __fish_seen_subcommand_from $__lanyard_subs" -a "check" -d "Validate token expiry and keychain access"
complete -c lanyard -n "not __fish_seen_subcommand_from $__lanyard_subs" -a "verify" -d "Confirm tokens are live against the API"
complete -c lanyard -n "not __fish_seen_subcommand_from $__lanyard_subs" -a "rotate" -d "Re-authenticate an existing account"
complete -c lanyard -n "not __fish_seen_subcommand_from $__lanyard_subs" -a "remove" -d "Delete an account from keychain and config"
complete -c lanyard -n "not __fish_seen_subcommand_from $__lanyard_subs" -a "completions" -d "Manage shell completions"
complete -c lanyard -n "not __fish_seen_subcommand_from $__lanyard_subs" -a "daemon" -d "Credential-sync daemon control"

complete -c lanyard -n "__fish_seen_subcommand_from use whoami check verify rotate remove" \\
  -a "(lanyard list --names 2>/dev/null)"
complete -c lanyard -n "__fish_seen_subcommand_from use" -l clear -d "Restore the default account"
complete -c lanyard -n "__fish_seen_subcommand_from completions" -a "install uninstall print"
complete -c lanyard -n "__fish_seen_subcommand_from daemon" -a "status start stop"
`;
