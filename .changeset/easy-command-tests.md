---
'@bookedsolid/lanyard': patch
---

Add unit tests for the `list`, `whoami`, `remove`, and `daemon` subcommand handlers. Covers active-account marker dual-source resolution (Claude Code keychain marker vs. `active-account` file, with the marker taking precedence and a warning emitted on mismatch), keychain-status reporting in `list` output, idempotent `remove` when the keychain entry is already gone, and `daemon status/start/stop` lifecycle wiring. 24 new tests; total 104 (when combined with the rest of the suite).
