---
'@bookedsolid/lanyard': patch
---

Add unit tests for the `use` subcommand — the most complex command in the surface. Covers the happy-path switch (default-credential backup on first switch, `claudeAiOauth` overlay with `_lanyardAccount` marker injection, active-account file update, daemon spawn), the no-re-backup invariant on subsequent switches, the `--clear` restore-and-stop path with default-credential validation, expired-token rejection, missing-credential rejection, missing-name and unknown-account rejection, and the file-lock refusal when a concurrent switch is in progress. 9 new tests; total 89 (when on this branch alone).
