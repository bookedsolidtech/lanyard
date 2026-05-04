---
'@bookedsolid/lanyard': minor
---

Initial public release of `lanyard`.

Switch between Claude OAuth accounts without touching your shell rc files. Each account is a credential on a lanyard you swap. macOS Keychain stores the OAuth blob; Claude Code's own refresh path stays intact across switches.

Subcommands: `add`, `list`, `use`, `whoami`, `check`, `verify`, `rotate`, `remove`, `completions install/uninstall`, `daemon status/start/stop`.

Carries forward the credential-handling invariants the multi-account problem actually requires: raw-blob passthrough, `claudeAiOauth` envelope wrapping, sibling-key merge to preserve `mcpOAuth`, identity-marker guard against cross-account contamination, sync-back before switch, background sync daemon, advisory file lock, and env-var sanitization before `claude auth login`.

macOS only at v1; Linux (libsecret) and Windows (wincred) backends planned behind the same platform interface.
