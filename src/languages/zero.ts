import { spawn } from "node:child_process";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Attempt, Diagnostic, Task, TestCase } from "../types.ts";

const WSL = "wsl";
const WSL_ARGS_BASE = ["-d", "Ubuntu", "--", "bash", "-lc"];

interface ExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

function execWsl(command: string, timeoutMs = 30_000, stdin?: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(WSL, [...WSL_ARGS_BASE, command], {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut,
      });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut: false,
      });
    });
  });
}

function toWslPath(winPath: string): string {
  const normalized = winPath.replace(/\\/g, "/");
  const driveMatch = /^([A-Za-z]):(.*)$/.exec(normalized);
  if (driveMatch) {
    return `/mnt/${driveMatch[1].toLowerCase()}${driveMatch[2]}`;
  }
  return normalized;
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export async function runZeroAttempt(
  task: Task,
  code: string,
): Promise<Pick<Attempt, "compileOk" | "testsPassed" | "testsTotal" | "diagnostics" | "rawTestOutput">> {
  const baseDir = join(tmpdir(), `zerobench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(baseDir, { recursive: true });

  const sourcePath = join(baseDir, "solution.0");
  await writeFile(sourcePath, code, "utf8");

  const wslBase = toWslPath(baseDir);

  const checkCmd = `export PATH="$HOME/.zero/bin:$PATH" && cd ${shellEscape(wslBase)} && zero check --json solution.0 2>&1`;
  const checkResult = await execWsl(checkCmd, 30_000);

  const checkJson = parseJsonSafe(checkResult.stdout);
  const diagnostics: Diagnostic[] = (checkJson?.diagnostics ?? []).map((d: any) => ({
    code: d.code,
    message: d.message,
    line: d.line,
    column: d.column,
    file: d.path,
  }));

  if (!checkJson?.ok || diagnostics.length > 0) {
    await rm(baseDir, { recursive: true, force: true });
    return {
      compileOk: false,
      testsPassed: 0,
      testsTotal: task.testCases.length,
      diagnostics: diagnostics.length > 0 ? diagnostics : [{
        message: extractFirstError(checkResult.stdout, checkResult.stderr),
      }],
      rawTestOutput: trim(checkResult.stdout + checkResult.stderr, 2000),
    };
  }

  const buildExeCmd = `export PATH="$HOME/.zero/bin:$PATH" && cd ${shellEscape(wslBase)} && zero build --emit exe --out solution solution.0 2>&1`;
  let buildResult = await execWsl(buildExeCmd, 60_000);

  const buildOut = buildResult.stdout + buildResult.stderr;
  if (buildResult.exitCode !== 0 && buildOut.includes("CGEN004")) {
    const buildObjCmd = `export PATH="$HOME/.zero/bin:$PATH" && cd ${shellEscape(wslBase)} && zero build --emit obj --out solution.o solution.0 && cc -o solution solution.o 2>&1`;
    buildResult = await execWsl(buildObjCmd, 90_000);
  }

  if (buildResult.exitCode !== 0) {
    await rm(baseDir, { recursive: true, force: true });
    return {
      compileOk: false,
      testsPassed: 0,
      testsTotal: task.testCases.length,
      diagnostics: [{
        message: extractFirstError(buildResult.stdout, buildResult.stderr),
      }],
      rawTestOutput: trim(buildResult.stdout + buildResult.stderr, 2000),
    };
  }

  let passed = 0;
  const failures: string[] = [];
  for (const tc of task.testCases) {
    let args = [...(tc.args ?? [])];
    if (tc.stdin !== undefined && args.length === 0) {
      await writeFile(join(baseDir, "input.txt"), tc.stdin, "utf8");
      args = ["input.txt"];
    }
    const argsStr = args.map(shellEscape).join(" ");
    const runCmd = `cd ${shellEscape(wslBase)} && ./solution ${argsStr}`;
    const runResult = await execWsl(runCmd, 15_000);
    const verdict = gradeRun(tc, runResult);
    if (verdict.ok) {
      passed += 1;
    } else {
      failures.push(`${tc.name}: ${verdict.reason}`);
    }
  }

  await rm(baseDir, { recursive: true, force: true });

  return {
    compileOk: true,
    testsPassed: passed,
    testsTotal: task.testCases.length,
    diagnostics: failures.length > 0 ? [{ message: failures.join(" | ") }] : [],
    rawTestOutput: trim(failures.join("\n"), 1500),
  };
}

function gradeRun(tc: TestCase, r: ExecResult): { ok: boolean; reason: string } {
  if (r.timedOut) return { ok: false, reason: "timeout" };
  if (tc.expectedExitCode !== undefined && r.exitCode !== tc.expectedExitCode) {
    return { ok: false, reason: `exit code ${r.exitCode} != ${tc.expectedExitCode}` };
  }
  if (tc.expectedStdout !== undefined) {
    const actual = r.stdout.replace(/\r\n/g, "\n");
    const expected = tc.expectedStdout.replace(/\r\n/g, "\n");
    if (actual !== expected) {
      return { ok: false, reason: `stdout mismatch (got ${JSON.stringify(trim(actual, 120))})` };
    }
  }
  if (tc.expectedStdoutContains) {
    for (const needle of tc.expectedStdoutContains) {
      if (!r.stdout.includes(needle)) {
        return { ok: false, reason: `stdout missing ${JSON.stringify(needle)}` };
      }
    }
  }
  return { ok: true, reason: "" };
}

function parseJsonSafe(s: string): any {
  try {
    const start = s.indexOf("{");
    if (start === -1) return null;
    return JSON.parse(s.slice(start));
  } catch {
    return null;
  }
}

function extractFirstError(stdout: string, stderr: string): string {
  const text = (stderr + "\n" + stdout).split("\n");
  for (const line of text) {
    const t = line.trim();
    if (t && !t.startsWith("===")) return trim(t, 400);
  }
  return "compile/build failed";
}

function trim(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
