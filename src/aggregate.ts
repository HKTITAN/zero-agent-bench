import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunResult } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

interface ModelLangStats {
  model: string;
  language: string;
  n: number;
  passed: number;
  passRate: number;
  meanAttemptsToGreen: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCostUsd: number;
  meanOutputTokensPerPass: number | null;
  errorCodeHist: Record<string, number>;
}

async function loadLatestRun(): Promise<{ runDir: string; results: RunResult[] }> {
  const rawDir = join(ROOT, "results", "raw");
  const runs = (await readdir(rawDir)).sort().reverse();
  if (runs.length === 0) throw new Error("no runs in results/raw");
  const runDir = join(rawDir, runs[0]);
  const resultsFile = join(runDir, "results.json");
  const raw = await readFile(resultsFile, "utf8");
  return { runDir, results: JSON.parse(raw) as RunResult[] };
}

function bucket(results: RunResult[]): ModelLangStats[] {
  const map = new Map<string, RunResult[]>();
  for (const r of results) {
    const k = `${r.model}|${r.language}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  const out: ModelLangStats[] = [];
  for (const [k, rs] of map) {
    const [model, language] = k.split("|");
    const passed = rs.filter((r) => r.finalPass);
    const passRate = passed.length / rs.length;
    const meanAttemptsToGreen = passed.length > 0
      ? passed.reduce((a, r) => a + (r.attemptsToGreen ?? 0), 0) / passed.length
      : null;
    const meanOutputTokensPerPass = passed.length > 0
      ? passed.reduce((a, r) => a + r.totalOutputTokens, 0) / passed.length
      : null;
    const errorCodeHist: Record<string, number> = {};
    for (const r of rs) {
      for (const a of r.attempts) {
        for (const d of a.diagnostics) {
          if (d.code) errorCodeHist[d.code] = (errorCodeHist[d.code] ?? 0) + 1;
        }
      }
    }
    out.push({
      model,
      language,
      n: rs.length,
      passed: passed.length,
      passRate,
      meanAttemptsToGreen,
      totalInputTokens: rs.reduce((a, r) => a + r.totalInputTokens, 0),
      totalOutputTokens: rs.reduce((a, r) => a + r.totalOutputTokens, 0),
      totalCacheReadTokens: rs.reduce((a, r) => a + r.totalCacheReadTokens, 0),
      totalCostUsd: rs.reduce((a, r) => a + r.estimatedCostUsd, 0),
      meanOutputTokensPerPass,
      errorCodeHist,
    });
  }
  out.sort((a, b) => a.model.localeCompare(b.model) || a.language.localeCompare(b.language));
  return out;
}

function fmtPct(p: number): string { return (p * 100).toFixed(1) + "%"; }
function fmtNum(n: number | null, digits = 2): string { return n === null ? "—" : n.toFixed(digits); }

function renderMarkdown(stats: ModelLangStats[], runDir: string): string {
  const lines: string[] = [];
  lines.push(`# zero-agent-bench results\n`);
  lines.push(`Run: ${runDir.split(/[/\\]/).pop()}\n`);
  lines.push(`## Pass rate and attempts\n`);
  lines.push(`| Model | Lang | N | Pass | Pass rate | Mean attempts | Mean out tok / pass | Cost |`);
  lines.push(`|---|---|--:|--:|--:|--:|--:|--:|`);
  for (const s of stats) {
    lines.push(`| ${s.model} | ${s.language} | ${s.n} | ${s.passed} | ${fmtPct(s.passRate)} | ${fmtNum(s.meanAttemptsToGreen)} | ${fmtNum(s.meanOutputTokensPerPass, 0)} | $${s.totalCostUsd.toFixed(3)} |`);
  }

  lines.push(`\n## Token totals per (model, language)\n`);
  lines.push(`| Model | Lang | Input | Output | Cache read |`);
  lines.push(`|---|---|--:|--:|--:|`);
  for (const s of stats) {
    lines.push(`| ${s.model} | ${s.language} | ${s.totalInputTokens} | ${s.totalOutputTokens} | ${s.totalCacheReadTokens} |`);
  }

  lines.push(`\n## Error-code distribution\n`);
  for (const s of stats) {
    const entries = Object.entries(s.errorCodeHist).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) continue;
    lines.push(`\n### ${s.model} / ${s.language}\n`);
    lines.push(`| Code | Count |`);
    lines.push(`|---|--:|`);
    for (const [code, n] of entries) lines.push(`| ${code} | ${n} |`);
  }

  return lines.join("\n") + "\n";
}

function renderCsv(stats: ModelLangStats[]): string {
  const headers = ["model", "language", "n", "passed", "passRate", "meanAttemptsToGreen", "totalInputTokens", "totalOutputTokens", "totalCacheReadTokens", "totalCostUsd", "meanOutputTokensPerPass"];
  const lines = [headers.join(",")];
  for (const s of stats) {
    lines.push([
      s.model, s.language, s.n, s.passed,
      s.passRate.toFixed(4), s.meanAttemptsToGreen?.toFixed(4) ?? "",
      s.totalInputTokens, s.totalOutputTokens, s.totalCacheReadTokens,
      s.totalCostUsd.toFixed(4), s.meanOutputTokensPerPass?.toFixed(2) ?? "",
    ].join(","));
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const { runDir, results } = await loadLatestRun();
  const stats = bucket(results);
  const md = renderMarkdown(stats, runDir);
  const csv = renderCsv(stats);
  await writeFile(join(runDir, "report.md"), md);
  await writeFile(join(runDir, "report.csv"), csv);
  console.log(md);
  console.log(`\nWrote report.md and report.csv to ${runDir}/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
