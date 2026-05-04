# @bookedsolid/lanyard

## 0.1.0

### Minor Changes

- 0cebfd8: Initial public release of `lanyard`.

  Switch between Claude OAuth accounts without touching your shell rc files. Each account is a credential on a lanyard you swap. macOS Keychain stores the OAuth blob; Claude Code's own refresh path stays intact across switches.

  Subcommands: `add`, `list`, `use`, `whoami`, `check`, `verify`, `rotate`, `remove`, `completions install/uninstall`, `daemon status/start/stop`.

  Carries forward the credential-handling invariants the multi-account problem actually requires: raw-blob passthrough, `claudeAiOauth` envelope wrapping, sibling-key merge to preserve `mcpOAuth`, identity-marker guard against cross-account contamination, sync-back before switch, background sync daemon, advisory file lock, and env-var sanitization before `claude auth login`.

  macOS only at v1; Linux (libsecret) and Windows (wincred) backends planned behind the same platform interface.

### Patch Changes

- 21dc706: Add unit tests for the `add` and `rotate` subcommands. Covers argument validation, the backup → login → capture → restore flow, first-time-setup (no backup), credential storage under the lanyard-namespaced keychain entry, login-failure rollback (CC backup restored, no orphan keychain write), no-token-captured failure, and `CLAUDE_CODE_OAUTH_*` env-var sanitization on the spawned `claude auth login` subprocess. 14 new tests; total 94 (when on this branch alone).
- c6dfa0d: Add unit tests for the `check` and `verify` subcommands. Covers single-account and `--all` flows, healthy/EXPIRED/MISSING states, token-preview redaction, refresh-token presence reporting, plan/tier formatting, profile-API success and failure paths, and registry-order iteration. 12 new tests; total 92 (when on this branch alone).
- 4a30aea: Add unit tests for the `list`, `whoami`, `remove`, and `daemon` subcommand handlers. Covers active-account marker dual-source resolution (Claude Code keychain marker vs. `active-account` file, with the marker taking precedence and a warning emitted on mismatch), keychain-status reporting in `list` output, idempotent `remove` when the keychain entry is already gone, and `daemon status/start/stop` lifecycle wiring. 24 new tests; total 104 (when combined with the rest of the suite).
- 2210f3a: Add ESLint flat config (`eslint.config.js`) covering `src/**/*.ts` with `@typescript-eslint/recommended` plus targeted credential-handling guardrails (`no-eval`, `no-implied-eval`, `no-new-func`, `consistent-type-imports`). Wire `pnpm lint` into the CI Lint job alongside `pnpm format:check`. Test files use a non-project-typed parser config to keep type-aware rule overhead off the test suite.
- 63641b4: Add unit tests for `oauth/profile` (Bearer-auth header, JSON parse failure, network error, timeout, `formatOrgType` mapping) and `oauth/daemon` lifecycle helpers (`getDaemonPid`, `isDaemonRunning`, `stopCredentialSyncDaemon` idempotency + PID-file cleanup on stale signals). 22 additional tests; suite total 102.
- b90a886: Add vitest test suite covering credential-handling invariants:
  - macOS Keychain primitives: atomic upsert, raw-blob passthrough, claudeAiOauth envelope wrap/unwrap, legacy oauth_token compatibility, sibling-key merge with mcpOAuth preservation.
  - Identity-marker injection on switch and identity-guard refusal on sync-back when the marker names a different account or matches the default credential's refresh token.
  - accounts.yaml schema: rejects inline `sk-ant-*` tokens, malformed YAML, and invalid `credential_store` values.
  - File lock acquire/release/stale-cleanup behavior.
  - Login env sanitization: strips `CLAUDE_CODE_OAUTH_*` env vars without mutating `process.env`.
  - Shell-completions installer: writes to standard XDG paths only, never modifies `~/.zshrc`, `~/.bashrc`, or `config.fish`; idempotent uninstall; unsupported-shell rejection; shell auto-detection from `$SHELL`.

  80 tests across 6 files, 391ms.

- b9b254b: Add unit tests for the `use` subcommand — the most complex command in the surface. Covers the happy-path switch (default-credential backup on first switch, `claudeAiOauth` overlay with `_lanyardAccount` marker injection, active-account file update, daemon spawn), the no-re-backup invariant on subsequent switches, the `--clear` restore-and-stop path with default-credential validation, expired-token rejection, missing-credential rejection, missing-name and unknown-account rejection, and the file-lock refusal when a concurrent switch is in progress. 9 new tests; total 89 (when on this branch alone).
