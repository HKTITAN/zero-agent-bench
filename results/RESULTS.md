# Benchmark results

Language: [Zero](https://zerolang.ai) · [Getting started](https://zerolang.ai/getting-started)

Raw run: `results/raw/2026-05-19T09-53-49-316Z/` · 56 task cells

> **Partial run:** 56/90 cells completed (API credits exhausted mid-run). Re-run missing tasks with `npm run bench -- --filter <id>` after topping up credits.

# zero-agent-bench results

Run: 2026-05-19T09-53-49-316Z

## Pass rate and attempts

| Model | Lang | N | Pass | Pass rate | Mean attempts | Mean out tok / pass | Cost |
|---|---|--:|--:|--:|--:|--:|--:|
| claude-haiku-4-5-20251001 | python | 9 | 9 | 100.0% | 1.00 | 59 | $0.004 |
| claude-haiku-4-5-20251001 | zero | 9 | 1 | 11.1% | 1.00 | 93 | $0.182 |
| claude-opus-4-7 | python | 9 | 9 | 100.0% | 1.00 | 58 | $0.072 |
| claude-opus-4-7 | zero | 10 | 6 | 60.0% | 1.83 | 804 | $1.373 |
| claude-sonnet-4-6 | python | 9 | 9 | 100.0% | 1.00 | 46 | $0.011 |
| claude-sonnet-4-6 | zero | 10 | 5 | 50.0% | 1.80 | 1138 | $0.360 |

## Token totals per (model, language)

| Model | Lang | Input | Output | Cache read |
|---|---|--:|--:|--:|
| claude-haiku-4-5-20251001 | python | 1567 | 533 | 0 |
| claude-haiku-4-5-20251001 | zero | 96552 | 17041 | 0 |
| claude-opus-4-7 | python | 2208 | 523 | 0 |
| claude-opus-4-7 | zero | 12541 | 13436 | 81928 |
| claude-sonnet-4-6 | python | 1576 | 415 | 0 |
| claude-sonnet-4-6 | zero | 12335 | 18329 | 63825 |

## Error-code distribution


### claude-haiku-4-5-20251001 / zero

| Code | Count |
|---|--:|
| PAR100 | 18 |
| STD002 | 2 |
| TYP002 | 2 |
| STD003 | 1 |

### claude-opus-4-7 / zero

| Code | Count |
|---|--:|
| STD002 | 6 |
| TYP001 | 3 |
| TYP002 | 2 |
| STD003 | 2 |

### claude-sonnet-4-6 / zero

| Code | Count |
|---|--:|
| STD002 | 7 |
| PAR100 | 6 |
| TYP002 | 3 |
| TYP001 | 2 |
| STD003 | 1 |


## Per-task pass (zero / python)

| Task | Opus Z | Opus Py | Sonnet Z | Sonnet Py | Haiku Z | Haiku Py |
|------|--------|---------|----------|-----------|---------|----------|
| 01-echo | pass | pass | pass | pass | pass | pass |
| 02-add | pass | pass | fail | pass | fail | pass |
| 03-even-odd | pass | pass | pass | pass | fail | pass |
| 04-fizzbuzz | fail | pass | fail | pass | fail | pass |
| 05-reverse-string | pass | pass | fail | pass | fail | pass |
| 06-max-of-three | fail | pass | pass | pass | fail | pass |
| 07-count-vowels | fail | pass | fail | pass | fail | pass |
| 08-factorial | pass | pass | pass | pass | fail | pass |
| 09-sum-stdin | fail | pass | fail | pass | fail | pass |
| 10-is-prime | pass | — | pass | — | — | — |

