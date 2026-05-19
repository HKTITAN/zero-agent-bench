# Contributing

## Upstream Zero

Language and compiler changes belong in [vercel-labs/zero](https://github.com/vercel-labs/zero). Example PRs:

- Agent CLI examples: https://github.com/vercel-labs/zero/pull/110
- Agent/tooling discussion: https://github.com/vercel-labs/zero/issues/104

## This repository

1. **Tasks** — add JSON under `tasks/` (see `src/types.ts`). Keep tasks language-fair CLI programs.
2. **Reference solutions** — add `reference/zero-*.0` and cover them in `npm run test:adapters`.
3. **Results** — after `npm run bench:full`, run `npm run report` (updates `results/RESULTS.md`).
4. **Resume partial runs** — if a run stops early, use `npm run bench:remaining` then `npm run report:merge`.

## Pattern skills

Community pattern skills live in [HKTITAN/zero-skills](https://github.com/HKTITAN/zero-skills). Each skill needs an eval task and pass-rate evidence per that repo's CONTRIBUTING.md.
