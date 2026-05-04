---
'@bookedsolid/lanyard': patch
---

Add unit tests for `oauth/profile` (Bearer-auth header, JSON parse failure, network error, timeout, `formatOrgType` mapping) and `oauth/daemon` lifecycle helpers (`getDaemonPid`, `isDaemonRunning`, `stopCredentialSyncDaemon` idempotency + PID-file cleanup on stale signals). 22 additional tests; suite total 102.
