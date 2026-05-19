import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Load KEY=value pairs from the first existing .env (does not override existing env). */
export function loadEnvFiles(...paths: string[]): void {
  for (const filePath of paths) {
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      const existing = process.env[key];
      if (existing !== undefined && existing.length > 0) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    return;
  }
}

export function loadBenchEnv(rootDir: string): void {
  loadEnvFiles(join(rootDir, ".env"), join(rootDir, "..", ".env"));
}
