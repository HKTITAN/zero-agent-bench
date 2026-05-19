import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { runTask } from "./runner.ts";
import { loadAllTasks, filterTasks, REMAINING_TASK_PREFIXES } from "./tasks.ts";
import { loadZeroSkillsForAgent, loadSkillFile } from "./skills.ts";
import { loadBenchEnv } from "./env.ts";
import type { Language, ModelId, RunResult } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

interface Args {
  models: ModelId[];
  languages: Language[];
  filters: string[];
  remaining: boolean;
  pilot: boolean;
  maxAttempts: number;
  skipZeroSkills: boolean;
  skillFile?: string;
  skillOnly: boolean;
  trials: number;
  dryRun: boolean;
  reportAfter: boolean;
  outDir: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    models: ["claude-haiku-4-5-20251001"],
    languages: ["zero", "python"],
    filters: [],
    remaining: false,
    pilot: false,
    maxAttempts: 3,
    skipZeroSkills: false,
    skillOnly: false,
    trials: 1,
    dryRun: false,
    reportAfter: false,
    outDir: join(ROOT, "results"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--pilot":
        args.pilot = true;
        args.models = ["claude-haiku-4-5-20251001"];
        break;
      case "--full":
        args.models = ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
        break;
      case "--model":
        args.models = [argv[++i] as ModelId];
        break;
      case "--models":
        args.models = argv[++i].split(",") as ModelId[];
        break;
      case "--languages":
        args.languages = argv[++i].split(",") as Language[];
        break;
      case "--filter":
        args.filters.push(argv[++i]);
        break;
      case "--remaining":
        args.remaining = true;
        args.models = ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
        break;
      case "--max-attempts":
        args.maxAttempts = parseInt(argv[++i], 10);
        break;
      case "--skip-zero-skills":
        args.skipZeroSkills = true;
        break;
      case "--skill-file":
        args.skillFile = argv[++i];
        break;
      case "--skill-only":
        args.skillOnly = true;
        break;
      case "--trials":
        args.trials = Math.max(1, parseInt(argv[++i], 10));
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--report":
        args.reportAfter = true;
        break;
      case "--out":
        args.outDir = argv[++i];
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`zero-agent-bench

Usage:
  npm run bench [options]

Options:
  --pilot                Run a small 5-task pilot with Haiku only (cheap sanity check).
  --full                 Run all 3 model tiers (Opus, Sonnet, Haiku).
  --model <id>           Run a single model.
  --models <a,b,c>       Comma-separated model ids.
  --languages <a,b>      Default zero,python. Comma-separated.
  --filter <text>        Filter tasks (repeatable: id/title/tag substring).
  --remaining            Tasks 11–15 only, all three model tiers (resume partial full run).
  --max-attempts <n>     Max fix-loop attempts per (task, lang, model). Default 3.
  --skip-zero-skills     Do not inject official Zero skills into the system prompt.
  --skill-file <path>    Inject a pattern skill markdown file (Zero language only).
  --skill-only           With --skill-file, skip official Zero skills.
  --trials <n>           Repeat each (task, lang, model) n times. Default 1.
  --dry-run              Load tasks and skills, do not call the model.
  --report               Run npm run report after the bench completes.
  --out <dir>            Output directory. Default ./results.
`);
}

async function main() {
  loadBenchEnv(ROOT);
  const args = parseArgs(process.argv.slice(2));

  const allTasks = await loadAllTasks();
  const filters = args.remaining ? REMAINING_TASK_PREFIXES : args.filters;
  let tasks = filterTasks(allTasks, filters.length > 0 ? filters : undefined);
  if (args.pilot) tasks = tasks.slice(0, 5);

  if (tasks.length === 0) {
    console.error("No tasks matched.");
    process.exit(2);
  }

  console.log(`Loaded ${tasks.length} tasks (of ${allTasks.length}).`);
  console.log(`Models: ${args.models.join(", ")}`);
  console.log(`Languages: ${args.languages.join(", ")}`);
  console.log(`Max attempts: ${args.maxAttempts}`);
  if (args.trials > 1) console.log(`Trials per cell: ${args.trials}`);

  let zeroSkillContent = "";
  let zeroSkillsLoaded: string[] = [];

  if (args.skillFile) {
    const pattern = await loadSkillFile(args.skillFile);
    zeroSkillContent = `\n# Pattern skill\n\n${pattern}\n`;
    zeroSkillsLoaded.push(args.skillFile);
    console.log(`Pattern skill: ${args.skillFile} (${pattern.length} chars)`);
  }

  if (!args.skipZeroSkills && !args.skillOnly) {
    const official = await loadZeroSkillsForAgent();
    zeroSkillContent = official.content + zeroSkillContent;
    zeroSkillsLoaded = [...official.names, ...zeroSkillsLoaded];
  }

  if (zeroSkillsLoaded.length > 0) {
    console.log(`Zero skills injected: ${zeroSkillsLoaded.join(", ")} (${zeroSkillContent.length} chars)`);
  }

  if (args.dryRun) {
    console.log("Dry run complete.");
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set.");
    process.exit(1);
  }

  await mkdir(args.outDir, { recursive: true });
  await mkdir(join(args.outDir, "raw"), { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(args.outDir, "raw", runId);
  await mkdir(runDir, { recursive: true });

  const allResults: RunResult[] = [];

  let totalSteps = tasks.length * args.languages.length * args.models.length * args.trials;
  let step = 0;

  for (const task of tasks) {
    for (const language of args.languages) {
      for (const model of args.models) {
        for (let trial = 1; trial <= args.trials; trial++) {
          step++;
          const trialSuffix = args.trials > 1 ? ` trial ${trial}` : "";
          const label = `[${step}/${totalSteps}] ${task.id} / ${language} / ${model}${trialSuffix}`;
          console.log(`\n${label}`);
          try {
            const result = await runTask(task, language, model, {
              maxAttempts: args.maxAttempts,
              zeroSkillContent: language === "zero" ? zeroSkillContent : undefined,
              zeroSkillsLoaded: language === "zero" ? zeroSkillsLoaded : [],
              onAttempt: ({ attempt, verdict }) => {
                console.log(`    ${verdict}`);
              },
            });
            allResults.push(result);
            const trialTag = args.trials > 1 ? `__t${trial}` : "";
            const fname = `${task.id}__${language}__${model}${trialTag}.json`;
            await writeFile(join(runDir, fname), JSON.stringify(result, null, 2));
            console.log(
              `    → ${result.finalPass ? "PASS" : "FAIL"} in ${result.attemptsToGreen ?? args.maxAttempts} attempt(s), $${result.estimatedCostUsd.toFixed(4)}`,
            );
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`    ERROR: ${message}`);
          }
        }
      }
    }
  }

  await writeFile(join(runDir, "results.json"), JSON.stringify(allResults, null, 2));
  console.log(`\nWrote ${allResults.length} results to ${runDir}/`);
  console.log(`Run: npm run report`);

  printSummary(allResults);

  if (args.reportAfter) {
    await runReport();
  }
}

function runReport(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "report"], {
      cwd: ROOT,
      shell: true,
      stdio: "inherit",
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`report exited with ${code}`));
    });
    child.on("error", reject);
  });
}

function printSummary(results: RunResult[]): void {
  if (results.length === 0) return;
  console.log("\n=== Summary ===");
  const byModelLang = new Map<string, RunResult[]>();
  for (const r of results) {
    const k = `${r.model} / ${r.language}`;
    if (!byModelLang.has(k)) byModelLang.set(k, []);
    byModelLang.get(k)!.push(r);
  }
  for (const [k, rs] of byModelLang) {
    const passed = rs.filter((r) => r.finalPass).length;
    const avgAttempts =
      rs.filter((r) => r.attemptsToGreen).reduce((a, r) => a + r.attemptsToGreen!, 0) / Math.max(1, passed);
    const totalCost = rs.reduce((a, r) => a + r.estimatedCostUsd, 0);
    const totalOut = rs.reduce((a, r) => a + r.totalOutputTokens, 0);
    console.log(
      `  ${k.padEnd(48)}  pass ${passed}/${rs.length}  avg-attempts ${avgAttempts.toFixed(2)}  out-tok ${totalOut}  $${totalCost.toFixed(3)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
