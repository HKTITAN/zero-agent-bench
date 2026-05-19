import { spawn } from "node:child_process";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Attempt, Diagnostic, Task, TestCase } from "../types.ts";

interface ExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

function exec(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; stdin?: string },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? 15_000);
    child.stdout.on("data", (c) => (stdout += c.toString("utf8")));
    child.stderr.on("data", (c) => (stderr += c.toString("utf8")));
    if (opts.stdin !== undefined) child.stdin.write(opts.stdin);
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
      resolve({ exitCode: -1, stdout, stderr, durationMs: Date.now() - start, timedOut: false });
    });
  });
}

export async function runPythonAttempt(
  task: Task,
  code: string,
): Promise<Pick<Attempt, "compileOk" | "testsPassed" | "testsTotal" | "diagnostics" | "rawTestOutput">> {
  const baseDir = join(tmpdir(), `pybench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(baseDir, { recursive: true });
  const sourcePath = join(baseDir, "solution.py");
  await writeFile(sourcePath, code, "utf8");

  const py = await resolvePythonCmd();
  const compileCheck = await exec(py, ["-m", "py_compile", sourcePath], {
    cwd: baseDir,
    timeoutMs: 15_000,
  });

  if (compileCheck.exitCode !== 0) {
    const diag = parsePythonError(compileCheck.stderr);
    await rm(baseDir, { recursive: true, force: true });
    return {
      compileOk: false,
      testsPassed: 0,
      testsTotal: task.testCases.length,
      diagnostics: [diag],
      rawTestOutput: trim(compileCheck.stderr, 2000),
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
    const result = await exec(py, ["solution.py", ...args], {
      cwd: baseDir,
      timeoutMs: 15_000,
    });
    const verdict = gradeRun(tc, result);
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

function parsePythonError(stderr: string): Diagnostic {
  const lines = stderr.split(/\r?\n/);
  const m = /^\s*File "(.+)", line (\d+)/.exec(stderr);
  const errLine = lines.reverse().find((l) => /Error/.test(l)) ?? lines[0] ?? stderr;
  return {
    code: /^(\w+Error):/m.exec(stderr)?.[1],
    message: errLine.trim() || "syntax error",
    line: m ? parseInt(m[2], 10) : undefined,
    file: m ? m[1] : undefined,
  };
}

function gradeRun(tc: TestCase, r: ExecResult): { ok: boolean; reason: string } {
  if (r.timedOut) return { ok: false, reason: "timeout" };
  if (tc.expectedExitCode !== undefined && r.exitCode !== tc.expectedExitCode) {
    return { ok: false, reason: `exit ${r.exitCode} != ${tc.expectedExitCode}` };
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

function trim(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

let cachedPython: string | null = null;

async function resolvePythonCmd(): Promise<string> {
  if (cachedPython) return cachedPython;
  for (const cmd of ["python", "python3", "py"]) {
    const args = cmd === "py" ? ["-3", "-c", "import sys"] : ["-c", "import sys"];
    const r = await exec(cmd, args, { timeoutMs: 5_000 });
    if (r.exitCode === 0) {
      cachedPython = cmd;
      return cmd;
    }
  }
  cachedPython = "python";
  return cachedPython;
}
