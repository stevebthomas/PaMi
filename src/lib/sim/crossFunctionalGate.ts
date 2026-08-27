import { CHANNEL_AGENTS } from "./relevance";
import type { AgentId, ChannelId } from "./types";

/**
 * Stage A of the agent-to-agent gate: a free, deterministic pre-filter that
 * runs client-side with zero API calls, before we ever consider paying for
 * the Stage B LLM gate (see CROSS_FUNCTIONAL_GATE_PROMPT in prompts.ts and
 * the /api/agents/gate route). The whole point is to filter out the routine
 * majority of messages for free — same philosophy as a cheap noise-filter
 * ahead of a richer call. Any one of these three being true is reason
 * enough to skip; this is deliberately biased toward "no."
 */
export interface StageAInput {
  channel: ChannelId;
  content: string;
  /** Number of currently-pending requiresResponse events (StateBag-derived,
   * via the store's `pendingResponseIds.size`) — a fully generic signal for
   * "is there live, unresolved business right now," not tied to any one
   * story's specific event ids. */
  pendingResponseCount: number;
  /** From pickReactingAgents(channel, content) — non-null only when this
   * channel has more than one candidate agent AND more than one of their
   * keyword sets matched the message. */
  secondaryAgentId: AgentId | null;
}

const ESCALATION_KEYWORDS =
  /urgent|asap|escalat|blocked|blocker|critical|severe|\bsev-?\d\b|deadline|commit|promise|can you own|can your team|depends on|need (you|your team) to/i;

export function stageAShouldSkip(input: StageAInput): boolean {
  const { channel, content, pendingResponseCount, secondaryAgentId } = input;
  const candidateCount = CHANNEL_AGENTS[channel]?.length ?? 0;

  // Bullet 1: in a channel with more than one candidate agent, only one
  // agent's keywords actually matched — no overlap, no reason to think a
  // second persona has a stake in this specific message.
  if (candidateCount > 1 && secondaryAgentId === null) return true;

  // Bullet 2: short message, nothing escalation-flavored in it.
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 6 && !ESCALATION_KEYWORDS.test(content)) return true;

  // Bullet 3: nothing cross-functional is actually live and unresolved
  // right now, regardless of what this message says.
  if (pendingResponseCount === 0) return true;

  return false;
}

/** Validates the Stage B gate's suggested second agent against who's
 * actually a legitimate participant in this channel (CHANNEL_AGENTS is the
 * same data pickReactingAgents already uses) — reusing existing data rather
 * than inventing a new allow-list. A second agent who isn't a member of the
 * channel gets rejected here rather than being rendered into a DM/channel
 * they have no presence in; see the report for why this is a deliberate v1
 * scoping decision, not an oversight. */
export function isValidSecondAgent(agentId: AgentId | null, channel: ChannelId, primaryAgentId: AgentId | null): agentId is AgentId {
  if (!agentId) return false;
  if (agentId === primaryAgentId) return false;
  const candidates = CHANNEL_AGENTS[channel] ?? [];
  return candidates.includes(agentId);
}
