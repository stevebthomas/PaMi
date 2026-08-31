/**
 * Approximate $/1M-token rates for the models this app actually calls at
 * runtime, used only to turn real token counts into a rough running-cost
 * estimate for the session cost tracker. Deliberately not exact: the
 * token counts themselves ARE exact (straight off the API response's
 * `usage` field, see extractUsage in anthropic.ts); only this conversion
 * to dollars is approximate. Update if pricing changes; this is a local
 * debug aid, not a billing source of truth.
 */
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-haiku-4-5": { inputPer1M: 1, outputPer1M: 5 },
  "claude-sonnet-4-6": { inputPer1M: 3, outputPer1M: 15 },
};

const DEFAULT_PRICING = { inputPer1M: 3, outputPer1M: 15 };

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return (inputTokens / 1_000_000) * pricing.inputPer1M + (outputTokens / 1_000_000) * pricing.outputPer1M;
}
