import type { Language, Task } from "./types.ts";

export interface PromptContext {
  language: Language;
  task: Task;
  zeroSkillContent?: string;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  if (ctx.language === "python") {
    return [
      "You are an expert Python programmer.",
      "Write a complete, runnable Python 3 program.",
      "Read input from stdin or sys.argv as the task specifies.",
      "Print output to stdout EXACTLY as the task requires — no extra prose, no trailing whitespace beyond what is specified.",
      "Return your solution as a single fenced ```python``` code block. Do not include explanations outside the code block.",
    ].join("\n");
  }

  const zeroIntro = [
    "You are an expert Zero programmer. Zero is a programming language designed for agents.",
    "Write a complete, runnable Zero program in a single source file.",
    "Read input from std.args.get(n) and write to world.out / world.err as the task specifies.",
    "For numeric args, parse decimal digits with string indexing (s[i]) — do not use std.parse on runtime strings (direct backend limitation).",
    "For file-input tasks, read the path from the first argument and use std.fs.readAll or std.fs.readBytes.",
    "Avoid negation with !, else-if chains, and helper functions that take World (inline main-only I/O for direct exe builds).",
    "Print output EXACTLY as the task requires — no extra prose.",
    "Return your solution as a single fenced ```zero``` code block. Do not include explanations outside the code block.",
    "",
  ].join("\n");

  return zeroIntro + (ctx.zeroSkillContent ?? "");
}

export function buildInitialUserMessage(task: Task): string {
  const testHint = task.testCases.length > 0 ? buildExampleHint(task) : "";
  return [
    `# Task: ${task.title}`,
    "",
    task.prompt,
    testHint,
  ].filter(Boolean).join("\n");
}

function buildExampleHint(task: Task): string {
  const tc = task.testCases[0];
  const parts: string[] = ["", "## Example", ""];
  if (tc.args && tc.args.length > 0) {
    parts.push(`Args: ${tc.args.join(" ")}`);
  }
  if (tc.stdin !== undefined) {
    parts.push(`Stdin: ${JSON.stringify(tc.stdin)}`);
  }
  if (tc.expectedStdout !== undefined) {
    parts.push(`Expected stdout: ${JSON.stringify(tc.expectedStdout)}`);
  } else if (tc.expectedStdoutContains) {
    parts.push(`Expected to contain: ${tc.expectedStdoutContains.map((s) => JSON.stringify(s)).join(", ")}`);
  }
  return parts.join("\n");
}

export function buildFixMessage(
  language: Language,
  failingCode: string,
  diagnostics: { code?: string; message: string; line?: number; column?: number }[],
  rawTestOutput: string | undefined,
): string {
  const diagHeader = diagnostics.map((d) => {
    const codePart = d.code ? `[${d.code}] ` : "";
    const locPart = d.line !== undefined ? `(line ${d.line}${d.column ? `, col ${d.column}` : ""}) ` : "";
    return `- ${codePart}${locPart}${d.message}`;
  }).join("\n");

  const langName = language === "zero" ? "Zero" : "Python";
  return [
    `Your previous ${langName} solution did not pass.`,
    "",
    "## Diagnostics",
    diagHeader || "(no structured diagnostics — output mismatch)",
    rawTestOutput ? `\n## Raw test output\n\n\`\`\`\n${rawTestOutput.slice(0, 800)}\n\`\`\`` : "",
    "",
    "Read the diagnostics carefully and produce a corrected solution.",
    `Return only the new ${langName} program as a single fenced code block.`,
  ].filter(Boolean).join("\n");
}
