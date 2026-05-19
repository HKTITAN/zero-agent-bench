import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const WSL = "wsl";
const WSL_ARGS = ["-d", "Ubuntu", "--", "bash", "-lc"];

const SKILLS_FOR_AGENT = [
  "zero-language",
  "zero-stdlib",
  "zero-diagnostics",
];

export async function loadZeroSkillsForAgent(): Promise<{ content: string; names: string[] }> {
  const chunks: string[] = [];
  const loaded: string[] = [];
  for (const name of SKILLS_FOR_AGENT) {
    const content = await getSkill(name);
    if (content) {
      chunks.push(`## Skill: ${name}\n\n${content}`);
      loaded.push(name);
    }
  }
  return {
    content: chunks.length > 0
      ? `\n# Zero Skills (loaded for this task)\n\n${chunks.join("\n\n---\n\n")}\n`
      : "",
    names: loaded,
  };
}

export async function loadSkillFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function getSkill(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(
      WSL,
      [...WSL_ARGS, `export PATH="$HOME/.zero/bin:$PATH" && zero skills get ${name} 2>/dev/null`],
      { windowsHide: true },
    );
    let stdout = "";
    child.stdout.on("data", (c) => (stdout += c.toString("utf8")));
    child.on("close", () => resolve(stdout.trim() || null));
    child.on("error", () => resolve(null));
  });
}
