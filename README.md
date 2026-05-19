# zero-agent-bench

A reproducible benchmark of frontier LLMs writing programs in [Zero](https://zerolang.ai) versus Python.

- **Language:** [zerolang.ai](https://zerolang.ai) · [Getting started](https://zerolang.ai/getting-started)
- **Upstream:** [vercel-labs/zero](https://github.com/vercel-labs/zero)
- **Pattern skills:** [HKTITAN/zero-skills](https://github.com/HKTITAN/zero-skills)

Zero is positioned as "the programming language for agents." This benchmark measures whether that thesis holds: when an LLM is given the same task in both languages, does Zero produce higher pass rates, fewer fix-loop attempts, or fewer output tokens per successful solution?

Companion to [vercel-labs/zero#104](https://github.com/vercel-labs/zero/issues/104) which observed that 100% of Zero failures cluster on PAR100 and IMP001. This harness re-runs that experiment across model tiers with a structured fix loop and reports per-diagnostic-code error distribution.

## What it measures

For each combination of `(task, language, model)`:

- **Pass rate** — did the final attempt produce a program that compiles and passes all hidden test cases?
- **Attempts to green** — how many model turns of `(generate → compile → run → feedback)` were needed to pass?
- **Output tokens per success** — how many tokens did the model generate in successful runs?
- **Error-code distribution** — which Zero diagnostic codes (PAR100, IMP001, NAM003, …) or Python exception types come up most often before the model recovers?

Each language uses its native, agent-facing failure signal: Zero gets structured JSON from `zero check --json`, Python gets the stderr traceback from `py_compile` and runtime errors. The model is given that exact signal verbatim as feedback before its next attempt.

## How to run

```bash
npm install
```

Set `ANTHROPIC_API_KEY` in the environment, or in `zero-agent-bench/.env` or the parent `Zero/.env` (loaded automatically).

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# Cheap pilot: 5 tasks × 2 languages × Haiku 4.5, ~$1
npm run bench:pilot

# Full run: 15 tasks × 2 languages × Opus 4.7 + Sonnet 4.6 + Haiku 4.5
npm run bench:full

# Single model
npm run bench -- --model claude-sonnet-4-6

# Filter to a subset of tasks
npm run bench -- --filter strings

# Ablation: do the version-matched Zero skills actually help?
npm run bench -- --model claude-sonnet-4-6 --skip-zero-skills
npm run bench -- --model claude-sonnet-4-6

npm run report

# Resume tasks 11–15 after a partial full run, then merge:
npm run bench:remaining
npm run report:merge -- <remaining-run-id>   # append run id to scripts/merge-runs.mjs args in package.json
```

## Requirements

- Node ≥ 20
- Python 3 (for the Python language adapter)
- Zero installed and on PATH inside WSL Ubuntu (the harness shells out to `wsl -d Ubuntu -- bash -lc 'zero …'`)

  ```bash
  wsl -d Ubuntu -- bash -lc 'curl -fsSL https://zerolang.ai/install.sh | sh'
  ```

On macOS or Linux, replace the WSL invocations in `src/languages/zero.ts` with direct `zero` calls.

## Fairness notes

The benchmark is deliberately written to be language-fair:

- All tasks are pure CLI programs: read from args or stdin, write to stdout, no network or filesystem dependencies.
- Tasks avoid features that meaningfully advantage one language (regex, comprehensions, advanced stdlib).
- Inputs stay within `i32` and use non-negative integers (Zero's parser does not currently accept negative integer literals, [#104-adjacent](https://github.com/vercel-labs/zero/issues/104)).
- Each language is told to print output _exactly_ as specified — comparing on byte-equal stdout, not approximate output.
- Both languages get the same prompt, the same fix-loop budget (3 attempts), and the same temperature defaults.
- The Zero side optionally injects the `zero-language`, `zero-stdlib`, and `zero-diagnostics` skills from `zero skills get` into the system prompt. Use `--skip-zero-skills` for an ablation comparison.

## Results

Published summaries:

| Run | Summary |
|-----|---------|
| Pilot (5 tasks, Haiku) | [results/PILOT.md](results/PILOT.md) |
| Full (15 tasks, all models) | [results/RESULTS.md](results/RESULTS.md) |

After a run, `results/raw/<timestamp>/report.md` contains:

- Pass rate per (model, language)
- Mean attempts to green per (model, language)
- Mean output tokens per successful run
- Full error-code distribution per (model, language)

Raw per-task results are written to `results/raw/<timestamp>/<task>__<lang>__<model>.json`.

## Tasks

The current set has 15 tasks across `trivial`, `easy`, and `medium` difficulty:

| ID | Title | Difficulty |
|---|---|---|
| 01-echo | Echo a single argument | trivial |
| 02-add | Add two non-negative integers from args | easy |
| 03-even-odd | Even or odd | easy |
| 04-fizzbuzz | FizzBuzz to N | easy |
| 05-reverse-string | Reverse an ASCII string | easy |
| 06-max-of-three | Maximum of three integers | easy |
| 07-count-vowels | Count lowercase vowels in a string | easy |
| 08-factorial | Factorial of a small N | easy |
| 09-sum-stdin | Sum integers from stdin | medium |
| 10-is-prime | Primality test | medium |
| 11-repeat-string | Repeat a string K times | easy |
| 12-gcd | Greatest common divisor | medium |
| 13-fibonacci | Nth Fibonacci number | medium |
| 14-sort-three | Sort three integers ascending | medium |
| 15-word-count | Count words in stdin | medium |

Adding a task: drop a JSON file in `tasks/` matching the `Task` type in `src/types.ts`.

## License

Apache-2.0
