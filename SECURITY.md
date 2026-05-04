# Security policy

`lanyard` handles OAuth credentials for Claude. It never logs them, never transmits them outside of the standard OAuth login flow your `claude` CLI already runs, and never writes them to disk in plaintext. Tokens live exclusively in macOS Keychain.

## Reporting a vulnerability

**Please do not file a public GitHub issue for security-impacting bugs.**

Email **security@bookedsolid.tech** with:

- A clear description of the issue and what makes it security-impacting.
- Steps to reproduce on a clean install.
- The lanyard version (`lanyard --version`) and macOS version.
- Optionally, a suggested mitigation.

We aim to acknowledge within **3 business days** and provide a remediation plan within **14 days** for confirmed issues. Reports are handled under coordinated disclosure: we agree on a public-disclosure date with you before announcing the fix.

## Scope

In scope:

- Credential leakage to disk, logs, env vars, or process arguments.
- Path-traversal or command-injection in any subcommand input (account names, completion paths, OAuth login flow).
- Race conditions between concurrent `lanyard use` invocations that could corrupt or cross-contaminate keychain state.
- Identity-marker bypass that allows a credential from one account to be synced back to another account's stored copy.
- Defects in the `--clear` path that leave the user without recoverable access to their default credential.
- Supply-chain attacks against `@bookedsolid/lanyard` itself (the npm tarball, release pipeline, or git repository).

Out of scope:

- Vulnerabilities in upstream dependencies that we do not actively trigger (please report those upstream).
- Behaviors that require an attacker to already have local user-level access to your machine (the macOS Keychain is the trust boundary; if an attacker is already running as your user, they can read it directly).
- Anthropic's OAuth flow itself or Claude Code's credential storage. Report those to Anthropic.

## Operational guarantees

- **No telemetry.** lanyard does not phone home, ever.
- **No background network.** The only network traffic lanyard initiates is `verify`'s call to `https://api.anthropic.com/api/oauth/profile`, which is opt-in per invocation.
- **No long-lived processes.** The credential-sync daemon is detached from your shell, polls every 45 seconds, and auto-exits after 8 hours or when the active account is cleared.
- **No file-system writes outside its own config and data directories** (`$XDG_CONFIG_HOME/lanyard`, `$XDG_DATA_HOME/lanyard`, and the standard shell-completion paths under `$XDG_DATA_HOME` / `$XDG_CONFIG_HOME` when you opt in via `lanyard completions install`).

## Supply chain

- The npm package is published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements/) signed by the GitHub Actions OIDC token.
- Releases are gated behind a [protected GitHub Actions environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) requiring human approval.
- Every release commit is required to be DCO-signed (`Signed-off-by:` trailer).
- Every PR runs `gitleaks` against the diff and against the working tree.
