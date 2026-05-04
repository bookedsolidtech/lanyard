---
'@bookedsolid/lanyard': patch
---

Add unit tests for the `add` and `rotate` subcommands. Covers argument validation, the backup → login → capture → restore flow, first-time-setup (no backup), credential storage under the lanyard-namespaced keychain entry, login-failure rollback (CC backup restored, no orphan keychain write), no-token-captured failure, and `CLAUDE_CODE_OAUTH_*` env-var sanitization on the spawned `claude auth login` subprocess. 14 new tests; total 94 (when on this branch alone).
