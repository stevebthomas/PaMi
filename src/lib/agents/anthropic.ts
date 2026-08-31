import Anthropic from "@anthropic-ai/sdk";
import type { AgentId } from "@/lib/sim/types";

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.local.example) to enable the AI agents."
    );
  }
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

/**
 * Per-agent model selection. The personas (Raj, Priya, Derek) are short,
 * in-character Slack replies: Haiku is fast and cheap enough for that.
 * The evaluator judges PM skill quality, which benefits from a stronger
 * reasoning model, so it defaults to Sonnet.
 */
const PERSONA_MODELS: Partial<Record<AgentId, string>> = {
  raj: process.env.RAJ_MODEL || "claude-haiku-4-5",
  priya: process.env.PRIYA_MODEL || "claude-haiku-4-5",
  derek: process.env.DEREK_MODEL || "claude-haiku-4-5",
  sam: process.env.SAM_MODEL || "claude-haiku-4-5",
  // The assigned engineers answer narrow, in-character status questions:
  // same Haiku tier as the other personas.
  jordan: process.env.JORDAN_MODEL || "claude-haiku-4-5",
  chen: process.env.CHEN_MODEL || "claude-haiku-4-5",
  // Marcus answers a narrow, grounded set of payout-pipeline questions from
  // his injected context: same Haiku tier as the other personas.
  marcus: process.env.MARCUS_MODEL || "claude-haiku-4-5",
};

export const EVALUATOR_MODEL = process.env.EVALUATOR_MODEL || "claude-sonnet-4-6";

/** Raj's fallback fix-decision call (see /api/agents/raj-fallback-decision).
 * Deliberately NOT the Haiku persona tier the other Raj replies use. This one
 * call needs a genuine, balanced judgment on a knife-edge tradeoff where both
 * options are equally defensible. Haiku, tested across several balanced prompt
 * framings, collapses to whichever side the wording weights most (observed 8:0
 * one way, then 8:0 the other on symmetric prompts) rather than deliberating,
 * so it can't deliver the reasoned variability this feature exists for. Sonnet
 * actually weighs the two costs and splits across runs, which is the whole
 * point. It's one call per disengaged playthrough, so the cost is negligible. */
export const RAJ_FALLBACK_MODEL = process.env.RAJ_FALLBACK_MODEL || "claude-sonnet-4-6";

/** Ask Claude is a lightweight glossary/concepts tool, not a persona: Haiku is
 * plenty for short definitional answers. The "Areas to study" synthesis on the
 * scorecard uses EVALUATOR_MODEL instead, since that's closer to judgment work. */
export const ASK_CLAUDE_MODEL = process.env.ASK_CLAUDE_MODEL || "claude-haiku-4-5";

/** Stage B of the agent-to-agent cross-functional gate: a cheap, fast
 * classifier call, so it gets the same tier as the personas, not the
 * evaluator. */
export const GATE_MODEL = process.env.GATE_MODEL || "claude-haiku-4-5";

export function getPersonaModel(agentId: AgentId): string {
  return PERSONA_MODELS[agentId] ?? "claude-haiku-4-5";
}

export function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

const LIST_MARKER_LINE = /^(?:—|--+)\s*(.*)$/;
const DASH_RUN = /\s*(?:—|--+)\s*/g;

/**
 * Sanitizes model output that ignores the "no em-dashes" house style. Every
 * Haiku persona (and Ask Claude) is instructed not to use em-dashes, but the
 * model doesn't always comply, so this is a defensive net applied to the
 * text before it reaches the player.
 *
 * Handles the em-dash character (U+2014) and the double-hyphen "--" some
 * completions substitute for it. Leaves single hyphens and en-dashes
 * (U+2013) alone, so numeric ranges like "9-10 min" or "10–15" are
 * untouched.
 *
 * Rules:
 *  - A line whose (trimmed) content starts with the dash is treated as a
 *    list marker and rewritten as a plain "- " bullet.
 *  - Anywhere else, a dash (with any surrounding whitespace) becomes ", ",
 *    which reads naturally whether it's joining two clauses or introducing
 *    a new one.
 *  - Any ", ," or ", <punctuation>" artifact the above produces is
 *    collapsed away.
 *
 * Pure function: no side effects, safe to call on any persona reply text.
 */
export function stripEmDashes(text: string): string {
  if (!text) return text;

  const lines = text.split("\n").map((line) => {
    const trimmed = line.trimStart();
    const indent = line.slice(0, line.length - trimmed.length);
    const listMatch = trimmed.match(LIST_MARKER_LINE);
    if (listMatch) {
      const rest = listMatch[1].trim();
      return rest ? `${indent}- ${rest}` : `${indent}-`;
    }
    return line.replace(DASH_RUN, ", ");
  });

  return lines
    .join("\n")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.!?;:])/g, "$1")
    .trim();
}

/** Real token counts straight off the API response: used for the local
 * session cost tracker. Never estimated; only the $/token conversion is an
 * approximation (see src/lib/costEstimate.ts). */
export function extractUsage(response: Anthropic.Message): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}
