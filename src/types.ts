export type Language = "zero" | "python";

export type ModelId =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";

export type Difficulty = "trivial" | "easy" | "medium" | "hard";

export interface Task {
  id: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  prompt: string;
  testCases: TestCase[];
}

export interface TestCase {
  name: string;
  stdin?: string;
  args?: string[];
  expectedStdout?: string;
  expectedStdoutContains?: string[];
  expectedExitCode?: number;
}

export interface Attempt {
  attemptNumber: number;
  code: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  durationMs: number;
  compileOk: boolean;
  testsPassed: number;
  testsTotal: number;
  diagnostics: Diagnostic[];
  rawTestOutput?: string;
}

export interface Diagnostic {
  code?: string;
  message: string;
  line?: number;
  column?: number;
  file?: string;
}

export interface RunResult {
  taskId: string;
  language: Language;
  model: ModelId;
  startedAt: string;
  durationMs: number;
  attempts: Attempt[];
  finalPass: boolean;
  attemptsToGreen: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  estimatedCostUsd: number;
  zeroSkillsLoaded: string[];
}
