import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Task } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(__dirname, "..", "tasks");

export async function loadAllTasks(): Promise<Task[]> {
  const files = (await readdir(TASKS_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();
  const tasks: Task[] = [];
  for (const f of files) {
    const raw = await readFile(join(TASKS_DIR, f), "utf8");
    const t = JSON.parse(raw) as Task;
    if (!t.id) throw new Error(`Task ${f} missing id`);
    if (!t.testCases || t.testCases.length === 0) {
      throw new Error(`Task ${f} has no testCases`);
    }
    tasks.push(t);
  }
  return tasks;
}

export function filterTasks(tasks: Task[], filter?: string): Task[] {
  if (!filter) return tasks;
  return tasks.filter((t) =>
    t.id.includes(filter) ||
    t.title.toLowerCase().includes(filter.toLowerCase()) ||
    t.tags.includes(filter),
  );
}
