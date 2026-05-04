# lanyard

> Switch between Claude OAuth accounts without touching your shell rc files.

Each account is a credential on a lanyard. Park it, swap it, walk away. macOS Keychain stores the OAuth blob; Claude Code's own refresh path stays intact across switches — sessions survive overnight, MCP server credentials survive every swap, and your `.zshrc` never gets a single line of generated junk in it.

## Status

Pre-release (`0.0.0`). macOS only at v1. Linux (libsecret) and Windows (wincred) backends are planned behind the same platform interface.

## Why lanyard

Multi-account Claude Code usage is a load of hidden footguns:

- Tokens rotate on every refresh, so naïve credential copies go stale within an hour.
- Claude Code's keychain blob has sibling keys (`mcpOAuth`) that any clumsy overwrite will nuke, disconnecting MCP servers.
- Concurrent terminals racing on a switch will corrupt the keychain.
- Inherited OAuth env vars break `claude auth login`.
- A second `claude auth login` from another shell can contaminate a stored credential if you trust the wrong source-of-truth.

lanyard handles all of that. It's the part of multi-account Claude usage that should have been a single 200-line CLI from day one.

## Install

```sh
npm i -g @bookedsolid/lanyard
```

## Quickstart

```sh
lanyard add personal              # OAuth login, store in keychain
lanyard add work                  # second account
lanyard list                      # see registered accounts
lanyard use work                  # swap active credential
lanyard whoami                    # confirm
lanyard completions install       # opt-in shell completions (no rc mutation)
```

## Design rules

- **No shell-rc injection, ever.** `lanyard completions install` writes to `$XDG_DATA_HOME/zsh/site-functions/_lanyard` (zsh), `$XDG_DATA_HOME/bash-completion/completions/lanyard` (bash), or `$XDG_CONFIG_HOME/fish/completions/lanyard.fish` — paths your shell already searches. Your `.zshrc` is yours.
- **Raw blob passthrough.** lanyard stores Claude Code's full credential blob, never just the access token. Token refresh metadata (`tokenEndpoint`, `clientId`, etc.) stays intact, so switched sessions keep refreshing.
- **Sibling-key merge.** Switching overlays only `claudeAiOauth` — `mcpOAuth` and any other top-level keys Claude Code keeps in that slot survive untouched.
- **Identity guard.** Each switch injects a `_lanyardAccount` marker at the top level of Claude Code's credential blob. The sync-back path refuses to copy a credential out unless its marker matches the account it would land in.
- **Background sync.** When you switch, a detached node process polls every 45s (max 8h) to copy Claude Code's rotated refresh tokens back to your stored account. Without it, your stored copy goes stale after the first refresh.
- **Advisory file lock.** Two terminals racing on `lanyard use` won't corrupt anything; one wins, the other reports lock contention.
- **Env sanitization on login.** `lanyard add` and `lanyard rotate` strip `CLAUDE_CODE_OAUTH_*` env vars before spawning `claude auth login`, so a previously switched parent shell can't poison the new flow.

## Subcommands

|                                 |                                                    |
| ------------------------------- | -------------------------------------------------- |
| `lanyard add <name>`            | Authenticate and store a new account.              |
| `lanyard list`                  | Show registered accounts and which is active.      |
| `lanyard use <name>`            | Make `<name>` the active account.                  |
| `lanyard use --clear`           | Restore the default credential.                    |
| `lanyard whoami [--short]`      | Show the active account.                           |
| `lanyard check [--all]`         | Validate token expiry and keychain access locally. |
| `lanyard verify [--all]`        | Confirm tokens are live against the Anthropic API. |
| `lanyard rotate <name>`         | Re-authenticate an existing account.               |
| `lanyard remove <name>`         | Delete an account from keychain and config.        |
| `lanyard completions install`   | Install shell completions to standard XDG paths.   |
| `lanyard completions uninstall` | Remove installed completions.                      |
| `lanyard daemon status`         | Inspect the credential-sync daemon.                |

## Storage layout

| Where                                                       | What                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| macOS Keychain `lanyard-<name>`                             | Per-account OAuth blob                                         |
| macOS Keychain `lanyard-__default__`                        | Backup of the credential present before your first switch      |
| macOS Keychain `Claude Code-credentials`                    | Claude Code's active slot — lanyard merges into this on switch |
| `~/Library/Application Support/lanyard/accounts.yaml`       | Registry of account names → keychain service refs (no tokens)  |
| `~/Library/Application Support/lanyard/active-account`      | Last switched account                                          |
| `~/Library/Application Support/lanyard/credential-sync.pid` | Background daemon PID                                          |

## License

MIT — Booked Solid Technology (Clarity House LLC).
