// Tipos do decision-client.cjs (para projetos TS). Copie junto com o .cjs.
export type NoulQuestion = { type: 'noul'; instructions: string; criteria?: { true: string; false: string } };
export type ChoiceQuestion = { type: 'choice'; instructions: string; criteria: Record<string, string | null> };
export type ScoreQuestion = { type: 'score'; instructions: string; criteria: string[] };
export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export type NoulAnswer = { type: 'noul'; p: number };
export type ChoiceAnswer = { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number };
export type ScoreAnswer = { type: 'score'; score: number; probabilities: Record<string, number>; legend?: Record<string, string>; confidence: number };
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer | { type: 'unknown'; raw: unknown };

export interface Config {
  provider: 'systemone';
  preset: string | null;
  base_url: string;
  host: string;
  model: string;
  api_key: string;
  timeout_ms: number;
  max_state_chars: number;
  retry_base_ms?: number;
  retries?: number;
  deadline_ms?: number;
  fetch?: typeof fetch;
}

export interface Decision {
  provider: string;
  model: string | null;
  ms: number;
  usage: { input_tokens?: number; output_tokens?: number };
  truncated: boolean;
  answers: Record<string, Answer>;
}

export function loadConfig(opts?: { cwd?: string; env?: NodeJS.ProcessEnv; globalPath?: string }): Config;
export function decide(opts: { state: unknown; questions: Record<string, Question>; config?: Config; cwd?: string; decisionName?: string | null }): Promise<Decision>;
export function scrub(text: string): string;
export function truncate(text: string, max: number): { text: string; truncated: boolean };
export const PRESETS: Record<string, { base_url: string; model: string; hosts: string[]; api_key_file?: string }>;
