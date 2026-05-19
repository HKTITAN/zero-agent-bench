import { generate, extractCodeBlock, type ModelTurn } from "./model.ts";
import { runZeroAttempt } from "./languages/zero.ts";
import { runPythonAttempt } from "./languages/python.ts";
import { buildSystemPrompt, buildInitialUserMessage, buildFixMessage } from "./prompts.ts";
import { estimateCostUsd } from "./pricing.ts";
import type { Attempt, Language, ModelId, RunResult, Task } from "./types.ts";

const MAX_ATTEMPTS_DEFAULT = 3;

export interface RunnerOptions {
  maxAttempts?: number;
  zeroSkillContent?: string;
  zeroSkillsLoaded?: string[];
  onAttempt?: (info: { attempt: number; verdict: string }) => void;
}

export async function runTask(
  task: Task,
  language: Language,
  model: ModelId,
  options: RunnerOptions = {},
): Promise<RunResult> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS_DEFAULT;
  const startedAt = new Date().toISOString();
  const runStart = Date.now();

  const system = buildSystemPrompt({ language, task, zeroSkillContent: options.zeroSkillContent });
  const turns: ModelTurn[] = [
    { role: "user", content: buildInitialUserMessage(task) },
  ];

  const attempts: Attempt[] = [];
  let attemptsToGreen: number | null = null;

  for (let i = 1; i <= maxAttempts; i++) {
    const modelResp = await generate(model, system, turns, language === "zero" ? 4096 : 3072);
    const code = extractCodeBlock(modelResp.text, language) ?? modelResp.text.trim();

    const exec = language === "zero"
      ? await runZeroAttempt(task, code)
      : await runPythonAttempt(task, code);

    const attempt: Attempt = {
      attemptNumber: i,
      code,
      inputTokens: modelResp.inputTokens,
      outputTokens: modelResp.outputTokens,
      cacheReadTokens: modelResp.cacheReadTokens,
      cacheCreationTokens: modelResp.cacheCreationTokens,
      durationMs: modelResp.durationMs,
      compileOk: exec.compileOk,
      testsPassed: exec.testsPassed,
      testsTotal: exec.testsTotal,
      diagnostics: exec.diagnostics,
      rawTestOutput: exec.rawTestOutput,
    };
    attempts.push(attempt);

    const verdict = !exec.compileOk
      ? `attempt ${i}: compile fail${exec.diagnostics[0]?.code ? ` [${exec.diagnostics[0].code}]` : ""}`
      : exec.testsPassed === exec.testsTotal
        ? `attempt ${i}: pass ${exec.testsPassed}/${exec.testsTotal}`
        : `attempt ${i}: ${exec.testsPassed}/${exec.testsTotal} tests`;
    options.onAttempt?.({ attempt: i, verdict });

    if (exec.compileOk && exec.testsPassed === exec.testsTotal) {
      attemptsToGreen = i;
      break;
    }

    if (i < maxAttempts) {
      turns.push({ role: "assistant", content: modelResp.text });
      turns.push({ role: "user", content: buildFixMessage(language, code, exec.diagnostics, exec.rawTestOutput) });
    }
  }

  const totals = attempts.reduce(
    (acc, a) => ({
      inp: acc.inp + a.inputTokens,
      out: acc.out + a.outputTokens,
      cr: acc.cr + a.cacheReadTokens,
      cw: acc.cw + a.cacheCreationTokens,
    }),
    { inp: 0, out: 0, cr: 0, cw: 0 },
  );

  return {
    taskId: task.id,
    language,
    model,
    startedAt,
    durationMs: Date.now() - runStart,
    attempts,
    finalPass: attemptsToGreen !== null,
    attemptsToGreen,
    totalInputTokens: totals.inp,
    totalOutputTokens: totals.out,
    totalCacheReadTokens: totals.cr,
    totalCacheCreationTokens: totals.cw,
    estimatedCostUsd: estimateCostUsd(model, totals.inp, totals.out, totals.cr, totals.cw),
    zeroSkillsLoaded: options.zeroSkillsLoaded ?? [],
  };
}
