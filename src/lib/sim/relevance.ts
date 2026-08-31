import { AGENT_NAMES, type AgentId, type ChannelId, type ScenarioEvent } from "./types";
import { dmContactForChannel } from "./dmContacts";

/** Every NPC who might reactively respond in a given channel/DM. DMs only
 * ever have one candidate; shared channels like #incidents can have more
 * than one agent with a stake in what gets asked there. #general's single
 * candidate only ever matters as the redirect voice (see REDIRECT_ONLY_CHANNELS):
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
 * all of them), this is who answers in full by default: matches who was
 * already the sole responder in #incidents before this existed. */
const DEFAULT_PRIMARY: Partial<Record<ChannelId, AgentId>> = {
  incidents: "raj",
  general: "priya",
};

/** Channels where nobody ever gives a full generated reply: any player
 * message just gets a short, canned redirect line pointing at the real
 * conversation. #general isn't a real incident-response surface in this
 * story; previously a message there vanished entirely (no candidate agent
 * existed for it at all), which read as a void, not a redirect. */
const REDIRECT_ONLY_CHANNELS = new Set<ChannelId>(["general"]);

/** Keyword relevance per agent, per channel: used only where a channel has
 * more than one candidate agent. Deliberately simple/deterministic rather
 * than an extra AI call: it keeps the redirect guaranteed-short and adds no
 * latency to every channel message. */
const RELEVANCE_KEYWORDS: Partial<Record<ChannelId, Partial<Record<AgentId, RegExp>>>> = {
  incidents: {
    raj: /webhook|backend|back-end|deploy|rollback|hotfix|root cause|codebase|server|database|engineer|stripe|\bapi\b|500s?\b|code\b/i,
    priya: /customer|support|\bcs\b|ticket|csat|response time|help ?desk|agents?\b|user experience|\bux\b|complain|sellers?\b/i,
  },
};

/** Incident/domain nouns that mark a message as plausibly reporting an issue
 * or seeking domain input: the deterministic relevance gate a #general
 * message must clear before it earns a redirect. Greetings, intros, and
 * chit-chat carry none of these and so get no canned redirect (they simply
 * get no response, matching the ambient-world design). */
const DOMAIN_INCIDENT_KEYWORDS =
  /incident|outage|down\b|broken|failing|degrad|error|500s?\b|webhook|deploy|rollback|hotfix|payment|stripe|checkout|apple ?pay|google ?pay|customer|support|\bcs\b|ticket|csat|seller|refund|payout|\bbug\b|escalat|root cause|\bapi\b/i;

/** True when the message plausibly reports a domain issue or seeks an agent's
 * domain input (used to gate the #general redirect). */
function seeksDomainInput(content: string): boolean {
  return DOMAIN_INCIDENT_KEYWORDS.test(content);
}

/** True when the message is addressed TO this agent (an @mention of them) but
 * carries no ask: a statement that delivers content rather than requesting
 * their input. A redirect to "DM me for the answer" is a non-sequitur in reply
 * to someone handing the agent the very thing they asked for, so it's
 * suppressed. Deterministic and cheap: an @mention of the agent's name with no
 * "?" reads as delivery, not a request. */
function deliversContentTo(agentId: AgentId, content: string): boolean {
  const mention = new RegExp(`@${AGENT_NAMES[agentId]}\\b`, "i");
  return mention.test(content) && !content.includes("?");
}

/** The short, in-voice redirect a relevant-but-not-primary agent posts in
 * the shared channel, pointing the player to DM them for the full answer:
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
  /** Who gives the full, live-generated reply in-channel: same as today. */
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
 * that live in this channel (caller-computed from generic engine state,
 * pendingResponseIds cross-referenced with the scenario data, so this
 * function stays a pure, story-agnostic lookup).
 *
 * `incidentKnowable` gates the redirect-only-channel redirect on the
 * underlying incident already being on the record (the caller passes
 * firedEventIds.has("priya-heads-up-dm")). Before that, a #general hello can't
 * be redirected to an incident that doesn't exist yet. Defaults to true so any
 * non-story caller keeps the prior behavior.
 */
export function pickReactingAgents(
  channel: ChannelId,
  content: string,
  pendingChannelEvents: ScenarioEvent[] = [],
  incidentKnowable: boolean = true
): ReactingAgents {
  // Registry DM channels (dm_jordan, dm_chen, …) aren't in the static
  // CHANNEL_AGENTS map: they're resolved generically from DM_CONTACTS, so any
  // future DM-capable contact behaves like the existing single-candidate DMs
  // (that contact answers in full, no secondary redirect) with zero new
  // per-character wiring here.
  const dmContact = dmContactForChannel(channel);
  if (dmContact) return { primary: dmContact.agentId, secondary: null };

  const candidates = CHANNEL_AGENTS[channel];
  if (!candidates || candidates.length === 0) return { primary: null, secondary: null };

  if (REDIRECT_ONLY_CHANNELS.has(channel)) {
    // A #general redirect only fires when the message plausibly reports/seeks
    // a domain issue AND the incident it points at is already knowable. A
    // pre-incident greeting, intro, or chit-chat clears neither bar and gets
    // no response at all (acceptable, matches the ambient-world design).
    if (!incidentKnowable || !seeksDomainInput(content)) {
      return { primary: null, secondary: null };
    }
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

  // Neither matched, or everyone matched: fall back to the default primary.
  const primary = defaultAgent;
  const secondary = matched.length === candidates.length ? candidates.find((id) => id !== primary) ?? null : null;
  // Suppress the redirect when the message is addressed TO the would-be
  // redirecting agent and merely delivers content (an @mention + statement,
  // not an ask). Pointing them at "DM me for the answer" is a non-sequitur in
  // reply to someone handing them what they asked for.
  if (secondary && deliversContentTo(secondary, content)) {
    return { primary, secondary: null };
  }
  return { primary, secondary };
}

export function getRedirectLine(channel: ChannelId, agentId: AgentId): string | null {
  return REDIRECT_LINES[channel]?.[agentId] ?? null;
}
