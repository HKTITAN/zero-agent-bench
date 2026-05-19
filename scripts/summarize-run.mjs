import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runId = process.argv[2] ?? (await import("node:fs/promises")).readdir(join(root, "results", "raw")).then((d) => d.sort().reverse()[0]);
const runDir = join(root, "results", "raw", runId);
const results = JSON.parse(await readFile(join(runDir, "results.json"), "utf8"));

const byTask = new Map();
for (const r of results) {
  if (!byTask.has(r.taskId)) byTask.set(r.taskId, []);
  byTask.get(r.taskId).push(r);
}

const lines = [
  "## Per-task pass (zero / python)",
  "",
  "| Task | Opus Z | Opus Py | Sonnet Z | Sonnet Py | Haiku Z | Haiku Py |",
  "|------|--------|---------|----------|-----------|---------|----------|",
];

const mark = (r) => (r?.finalPass ? "pass" : r ? "fail" : "—");

for (const task of [...byTask.keys()].sort()) {
  const rs = byTask.get(task);
  const get = (m, l) => rs.find((r) => r.model === m && r.language === l);
  lines.push(
    `| ${task} | ${mark(get("claude-opus-4-7", "zero"))} | ${mark(get("claude-opus-4-7", "python"))} | ${mark(get("claude-sonnet-4-6", "zero"))} | ${mark(get("claude-sonnet-4-6", "python"))} | ${mark(get("claude-haiku-4-5-20251001", "zero"))} | ${mark(get("claude-haiku-4-5-20251001", "python"))} |`,
  );
}

console.log(lines.join("\n"));
