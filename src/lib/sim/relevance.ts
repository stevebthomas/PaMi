import type { AgentId, ChannelId, ScenarioEvent } from "./types";
import { dmContactForChannel } from "./dmContacts";

/** Every NPC who might reactively respond in a given channel/DM. DMs only
 * ever have one candidate; shared channels like #incidents can have more
 * than one agent with a stake in what gets asked there. #general's single
 * candidate only ever matters as the redirect voice (see REDIRECT_ONLY_CHANNELS) —
 * nobody gives a full reply there. */
export const CHANNEL_AGENTS: Partial<Record<ChannelId, AgentId[]>> = {
  incidents: ["raj", "priya"],
  dm_raj: ["raj"],
  dm_priya: ["priya"],
  dm_derek: ["derek"],
  general: ["priya"],
  "design-review": ["maya"],
  random: ["theo"],
};

/** When a channel message doesn't clearly point at one agent (or points at
 * all of them), this is who answers in full by default — matches who was
 * already the sole responder in #incidents before this existed. */
const DEFAULT_PRIMARY: Partial<Record<ChannelId, AgentId>> = {
  incidents: "raj",
  general: "priya",
};

/** Channels where nobody ever gives a full generated reply — any player
 * message just gets a short, canned redirect line pointing at the real
 * conversation. #general isn't a real incident-response surface in this
 * story; previously a message there vanished entirely (no candidate agent
 * existed for it at all), which read as a void, not a redirect. */
const REDIRECT_ONLY_CHANNELS = new Set<ChannelId>(["general"]);

/** Keyword relevance per agent, per channel — used only where a channel has
 * more than one candidate agent. Deliberately simple/deterministic rather
 * than an extra AI call: it keeps the redirect guaranteed-short and adds no
 * latency to every channel message. */
const RELEVANCE_KEYWORDS: Partial<Record<ChannelId, Partial<Record<AgentId, RegExp>>>> = {
  incidents: {
    raj: /webhook|backend|back-end|deploy|rollback|hotfix|root cause|codebase|server|database|engineer|stripe|\bapi\b|500s?\b|code\b/i,
    priya: /customer|support|\bcs\b|ticket|csat|response time|help ?desk|agents?\b|user experience|\bux\b|complain|sellers?\b/i,
  },
};

/** The short, in-voice redirect a relevant-but-not-primary agent posts in
 * the shared channel, pointing the player to DM them for the full answer —
 * also what fires for the whole reply in a REDIRECT_ONLY_CHANNELS channel. */
const REDIRECT_LINES: Partial<Record<ChannelId, Partial<Record<AgentId, string>>>> = {
  incidents: {
    raj: "That's more on my end, DM me and I'll walk you through what's happening on the backend.",
    priya: "That's me, DM me and I'll pull up what CS is seeing.",
  },
  general: {
    priya: "Let's take this to #incidents so it's actually tracked, I'll meet you there.",
  },
};

export interface ReactingAgents {
  /** Who gives the full, live-generated reply in-channel — same as today. */
  primary: AgentId | null;
  /** Who (if anyone) posts a short in-channel redirect to DM instead. */
  secondary: AgentId | null;
}

/**
 * Decides who reacts to a player's channel message. Single-candidate
 * channels (every DM) behave exactly as before. For a multi-agent channel:
 * - exactly one agent's keywords match → that agent answers in full
 * - neither or both match → a still-open ask from a specific agent in this
 *   channel wins the tiebreak over the static channel default, so a neutral
 *   reply to (say) Priya's still-unanswered escalation goes to her, not
 *   whoever the channel's usual first responder happens to be; if nothing's
 *   open, the static default wins as before
 * - if BOTH matched, the other one posts a short redirect instead of
 *   staying silent (a relevant agent no longer just never responds because
 *   they weren't the "expected" one)
 *
 * `pendingChannelEvents` is the currently-pending requiresResponse events
 * that live in this channel (caller-computed from generic engine state —
 * pendingResponseIds cross-referenced with the scenario data — so this
 * function stays a pure, story-agnostic lookup).
 */
export function pickReactingAgents(
  channel: ChannelId,
  content: string,
  pendingChannelEvents: ScenarioEvent[] = []
): ReactingAgents {
  // Registry DM channels (dm_jordan, dm_chen, …) aren't in the static
  // CHANNEL_AGENTS map — they're resolved generically from DM_CONTACTS, so any
  // future DM-capable contact behaves like the existing single-candidate DMs
  // (that contact answers in full, no secondary redirect) with zero new
  // per-character wiring here.
  const dmContact = dmContactForChannel(channel);
  if (dmContact) return { primary: dmContact.agentId, secondary: null };

  const candidates = CHANNEL_AGENTS[channel];
  if (!candidates || candidates.length === 0) return { primary: null, secondary: null };

  if (REDIRECT_ONLY_CHANNELS.has(channel)) {
    return { primary: null, secondary: DEFAULT_PRIMARY[channel] ?? candidates[0] };
  }

  if (candidates.length === 1) return { primary: candidates[0], secondary: null };

  const keywordMap = RELEVANCE_KEYWORDS[channel] ?? {};
  const matched = candidates.filter((id) => keywordMap[id]?.test(content));

  const pendingAgentHere = pendingChannelEvents.find((e) => candidates.includes(e.agentId))?.agentId;
  const defaultAgent = pendingAgentHere ?? DEFAULT_PRIMARY[channel] ?? candidates[0];

  if (matched.length === 1) {
    return { primary: matched[0], secondary: null };
  }

  // Neither matched, or everyone matched — fall back to the default primary.
  const primary = defaultAgent;
  const secondary = matched.length === candidates.length ? candidates.find((id) => id !== primary) ?? null : null;
  return { primary, secondary };
}

export function getRedirectLine(channel: ChannelId, agentId: AgentId): string | null {
  return REDIRECT_LINES[channel]?.[agentId] ?? null;
}
