import type { ModelId } from "./types.ts";

interface ModelPricing {
  inputPerMTok: number;
  cacheWritePerMTok: number;
  cacheReadPerMTok: number;
  outputPerMTok: number;
}

const PRICING: Record<ModelId, ModelPricing> = {
  "claude-opus-4-7": {
    inputPerMTok: 15,
    cacheWritePerMTok: 18.75,
    cacheReadPerMTok: 1.5,
    outputPerMTok: 75,
  },
  "claude-sonnet-4-6": {
    inputPerMTok: 3,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.3,
    outputPerMTok: 15,
  },
  "claude-haiku-4-5-20251001": {
    inputPerMTok: 1,
    cacheWritePerMTok: 1.25,
    cacheReadPerMTok: 0.1,
    outputPerMTok: 5,
  },
};

export function estimateCostUsd(
  model: ModelId,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
): number {
  const p = PRICING[model];
  const inputPaid = Math.max(0, inputTokens - cacheReadTokens - cacheCreationTokens);
  return (
    (inputPaid * p.inputPerMTok) / 1_000_000 +
    (cacheCreationTokens * p.cacheWritePerMTok) / 1_000_000 +
    (cacheReadTokens * p.cacheReadPerMTok) / 1_000_000 +
    (outputTokens * p.outputPerMTok) / 1_000_000
  );
}
