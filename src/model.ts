import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { loadBenchEnv } from "./env.ts";
import type { ModelId } from "./types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
loadBenchEnv(ROOT);

const client = new Anthropic();

export interface ModelTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ModelResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  stopReason: string | null;
  durationMs: number;
}

export async function generate(
  model: ModelId,
  system: string,
  turns: ModelTurn[],
  maxTokens = 4096,
): Promise<ModelResponse> {
  const start = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: turns.map((t) => ({ role: t.role, content: t.content })),
  });

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    stopReason: response.stop_reason,
    durationMs: Date.now() - start,
  };
}

export function extractCodeBlock(
  text: string,
  language: "zero" | "python",
): string | null {
  const fenceLabel = language === "zero" ? "zero" : "python";
  const fencePattern = new RegExp(
    "```(?:" + fenceLabel + "|\\.0|py)?\\n([\\s\\S]*?)```",
    "m",
  );
  const m = fencePattern.exec(text);
  if (m) return m[1].trim();
  const anyFence = /```\n([\s\S]*?)```/m.exec(text);
  if (anyFence) return anyFence[1].trim();
  return null;
}
