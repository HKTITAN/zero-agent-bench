import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runZeroAttempt } from "./languages/zero.ts";
import { runPythonAttempt } from "./languages/python.ts";
import { loadAllTasks } from "./tasks.ts";
import type { Task } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REF = join(__dirname, "..", "reference");

const PY_ECHO = `import sys
args = sys.argv[1:]
if len(args) == 0:
    print("missing")
else:
    print(args[0])
`;

const PY_ADD = `import sys
a, b = int(sys.argv[1]), int(sys.argv[2])
print(a + b)
`;

const PY_SUM_STDIN = `import sys
path = sys.argv[1]
total = 0
with open(path, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line:
            total += int(line)
print(total)
`;

const PY_WORD_COUNT = `import sys
path = sys.argv[1]
count = 0
in_word = False
with open(path, "rb") as f:
    data = f.read()
for ch in data:
    is_ws = ch in (32, 9, 10, 13)
    if is_ws:
        in_word = False
    elif not in_word:
        count += 1
        in_word = True
print(count)
`;

async function loadRef(name: string): Promise<string> {
  return readFile(join(REF, name), "utf8");
}

async function check(task: Task, lang: "zero" | "python", code: string, expectPass: boolean) {
  const r = lang === "zero" ? await runZeroAttempt(task, code) : await runPythonAttempt(task, code);
  const status = r.testsPassed === r.testsTotal ? "PASS" : "FAIL";
  const note = !r.compileOk
    ? ` compile=NO diag=${JSON.stringify(r.diagnostics[0])}`
    : ` ${r.testsPassed}/${r.testsTotal}`;
  const verdict = (r.testsPassed === r.testsTotal) === expectPass ? "OK" : "UNEXPECTED";
  console.log(`[${verdict}] ${task.id} (${lang}) ${status}${note}`);
  if (verdict === "UNEXPECTED" && r.rawTestOutput) {
    console.log(`       ${r.rawTestOutput.slice(0, 200)}`);
  }
}

async function main() {
  const tasks = await loadAllTasks();
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const zeroEcho = await loadRef("zero-echo.0");
  const zeroAdd = await loadRef("zero-add.0");
  const zeroSum = await loadRef("zero-sum-stdin.0");
  const zeroWords = await loadRef("zero-word-count.0");

  console.log("Python sanity:");
  await check(taskMap.get("01-echo")!, "python", PY_ECHO, true);
  await check(taskMap.get("02-add")!, "python", PY_ADD, true);
  await check(taskMap.get("09-sum-stdin")!, "python", PY_SUM_STDIN, true);
  await check(taskMap.get("15-word-count")!, "python", PY_WORD_COUNT, true);

  console.log("\nZero sanity:");
  await check(taskMap.get("01-echo")!, "zero", zeroEcho, true);
  await check(taskMap.get("02-add")!, "zero", zeroAdd, true);
  await check(taskMap.get("09-sum-stdin")!, "zero", zeroSum, true);
  await check(taskMap.get("15-word-count")!, "zero", zeroWords, true);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
