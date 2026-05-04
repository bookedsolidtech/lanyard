# Contributing to lanyard

Thanks for your interest. This is a focused tool — one job, done well — so contribution scope is correspondingly narrow.

## What's in scope

- Fixes for credential-handling bugs (keychain, envelope, sibling-key merge, identity guard, sync daemon, file lock).
- Cross-platform backends: Linux (`secret-tool` / libsecret) and Windows (`wincred`) implementations of the `platform/keychain.ts` interface.
- Shell-completion improvements for zsh, bash, fish — including new shells (nushell, etc.) provided they ship completions to a standard discovery path and never modify user rc files.
- Tests, especially for credential-handling invariants. Coverage of edge cases is always welcome.
- Docs.

## What's out of scope

- Anything that writes to `~/.zshrc`, `~/.bashrc`, `config.fish`, or any other user shell-rc file. This is the headline non-goal of the project.
- Storing credentials anywhere outside the platform credential store (no encrypted-file fallbacks, no env-var default, no remote sync).
- New scopes (account budgets, usage tracking, cost analytics, multi-machine sync). These are different products.

## Development setup

Requires Node 22+ and pnpm 9.12+ (declared in `packageManager`).

```sh
git clone https://github.com/bookedsolidtech/lanyard.git
cd lanyard
pnpm install
pnpm build
pnpm test
```

Useful targets:

- `pnpm format` — Prettier write
- `pnpm format:check` — CI gate
- `pnpm type-check` — `tsc --noEmit`
- `pnpm test` / `pnpm test:watch` — vitest
- `pnpm pack --pack-destination /tmp/lanyard-pack` — exercise the publish payload

## PR requirements

Every PR must satisfy the CI gates:

1. **Lint** (`pnpm format:check`).
2. **Typecheck** (`pnpm type-check`).
3. **Tests** pass on macOS-latest Node 22 (CI).
4. **Build** clean.
5. **Changeset** present (`pnpm changeset` and commit the generated `.changeset/*.md`). Use `patch` for bugfixes, `minor` for additive features, `major` for breaking changes. If your PR is docs-only or test-only, add the `@changesets/skip` label instead.
6. **Gitleaks** clean.
7. **DCO sign-off** on every commit (`git commit -s`). See [developercertificate.org](https://developercertificate.org/).
8. **No AI attribution** in commits or PR bodies. lanyard's policy gates reject `Co-Authored-By:` lines naming AI tools and `Generated with [Tool]` footers.

## Reviewing your own credential-handling changes

If your PR touches `src/platform/keychain.ts`, `src/oauth/`, or `src/cli/commands/use.ts`, please verify these regression scenarios manually before requesting review:

1. **Token-refresh survival** — register two accounts, `lanyard use a`, run `claude` for >70 minutes (past the 1h refresh boundary), confirm it still works.
2. **MCP-sibling merge** — register an MCP server in Claude Code, `lanyard use a`, `lanyard use b`, confirm the MCP server config survives.
3. **Identity-guard refusal** — manually edit Claude Code's keychain blob to insert a wrong `_lanyardAccount` marker, run any command that triggers sync-back, confirm the stored credential is not overwritten.
4. **Concurrent-switch race** — open two terminals and run `lanyard use a` and `lanyard use b` simultaneously. One must succeed, the other must report lock contention; neither must corrupt the keychain.

These scenarios are not yet automatable in CI (they require a real Claude Code install and live OAuth tokens). The goal over time is to add an opt-in `pnpm test:e2e` target that hits a real keychain in a sandboxed user account.

## License

By contributing, you agree your contributions are licensed under the MIT License (matching the repository).
