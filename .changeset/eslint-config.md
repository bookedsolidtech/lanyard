---
'@bookedsolid/lanyard': patch
---

Add ESLint flat config (`eslint.config.js`) covering `src/**/*.ts` with `@typescript-eslint/recommended` plus targeted credential-handling guardrails (`no-eval`, `no-implied-eval`, `no-new-func`, `consistent-type-imports`). Wire `pnpm lint` into the CI Lint job alongside `pnpm format:check`. Test files use a non-project-typed parser config to keep type-aware rule overhead off the test suite.
