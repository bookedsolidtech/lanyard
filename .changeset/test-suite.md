---
'@bookedsolid/lanyard': patch
---

Add vitest test suite covering credential-handling invariants:

- macOS Keychain primitives: atomic upsert, raw-blob passthrough, claudeAiOauth envelope wrap/unwrap, legacy oauth_token compatibility, sibling-key merge with mcpOAuth preservation.
- Identity-marker injection on switch and identity-guard refusal on sync-back when the marker names a different account or matches the default credential's refresh token.
- accounts.yaml schema: rejects inline `sk-ant-*` tokens, malformed YAML, and invalid `credential_store` values.
- File lock acquire/release/stale-cleanup behavior.
- Login env sanitization: strips `CLAUDE_CODE_OAUTH_*` env vars without mutating `process.env`.
- Shell-completions installer: writes to standard XDG paths only, never modifies `~/.zshrc`, `~/.bashrc`, or `config.fish`; idempotent uninstall; unsupported-shell rejection; shell auto-detection from `$SHELL`.

80 tests across 6 files, 391ms.
