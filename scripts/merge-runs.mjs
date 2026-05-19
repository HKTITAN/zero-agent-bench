/**
 * Merge multiple results/raw/<runId>/results.json files into one combined results.json
 * and regenerate results/RESULTS.md via aggregate.
 *
 * Usage: node scripts/merge-runs.mjs <runId1> <runId2> ...
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runIds = process.argv.slice(2);
if (runIds.length === 0) {
  console.error("usage: node scripts/merge-runs.mjs <runId> [runId...]");
  process.exit(1);
}

const key = (r) => `${r.taskId}|${r.language}|${r.model}|${r.trial ?? 1}`;
const merged = new Map();

for (const id of runIds) {
  const path = join(root, "results", "raw", id, "results.json");
  const rows = JSON.parse(await readFile(path, "utf8"));
  for (const r of rows) merged.set(key(r), r);
}

const outId = `merged-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const outDir = join(root, "results", "raw", outId);
await mkdir(outDir, { recursive: true });
const results = [...merged.values()].sort(
  (a, b) =>
    a.taskId.localeCompare(b.taskId) ||
    a.language.localeCompare(b.language) ||
    a.model.localeCompare(b.model),
);
await writeFile(join(outDir, "results.json"), JSON.stringify(results, null, 2));
console.log(`Merged ${results.length} cells -> results/raw/${outId}/results.json`);

const agg = spawnSync("npm", ["run", "report"], { cwd: root, stdio: "inherit", shell: true });
process.exit(agg.status ?? 1);
