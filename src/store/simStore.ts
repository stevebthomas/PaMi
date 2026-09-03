import { create } from "zustand";
import { day1ScenarioEvents, SCENARIO_LABELS, DAY_END_MINUTES } from "@/data/day1-scenario";
import type {
  AgentId,
  AskClaudeMessage,
  CategoryExplanation,
  ChannelId,
  CoachingEntry,
  DayScorecardRecord,
  Difficulty,
  EasterEggDiscovery,
  Evaluation,
  HelpQuery,
  Message,
  ScorecardScores,
  StateBag,
} from "@/lib/sim/types";
import { initialStateBag } from "@/lib/sim/types";
import { logHelpQueryToSupabase, logDayOutcomeToSupabase } from "@/lib/supabase/persist";
import { saveDayOutcome } from "@/lib/sim/outcomeStore";
import { pickReactingAgents, getRedirectLine } from "@/lib/sim/relevance";
import { presentInChannel } from "@/lib/sim/roster";
import {
  DM_CONTACTS,
  buildDmPersonaContext,
  buildFixLandedFollowUp,
  buildObligationMessageContent,
  dmChannelId,
  type DmContact,
} from "@/lib/sim/dmContacts";
import {
  recordFixDecisionAck,
  recordFixEngineerCommitments,
  settleFixEngineerCommitment,
  settlePlayerOwesCsTemplate,
  recordPlayerOwesSellerComms,
  settlePlayerOwesSellerComms,
  recordTopicDiscussed,
  DISCUSSED_RAJ_INCIDENT_OPTIONS,
  DISCUSSED_PRIYA_TICKET_SPIKE,
} from "@/lib/sim/commitments";
import { evaluateObligations, seedRajAllClear, seedPriyaSellerCommsAsk } from "@/lib/sim/obligations";
import { buildStandupDoc, standupDigestContent, STANDUP_DOC_ID, STANDUP_DOC_FILENAME } from "@/lib/sim/standup";
import { getIncidentTimeline } from "@/lib/sim/incidentTimeline";
import { formatSimClock } from "@/lib/sim/timeOfDay";
import { satisfyingChannels } from "@/lib/sim/acknowledgment";
import { stageAShouldSkip, isValidSecondAgent } from "@/lib/sim/crossFunctionalGate";
import { computeScorecard, buildStudyAreas, mergeCoordinationScore, analyzeAttributions, injectAttributionStudyTopic } from "@/lib/sim/scorecard";
import { buildDayOutcome } from "@/lib/sim/dayOutcome";
import { deriveSessionObservations } from "@/lib/sim/sessionObservations";
import { INCIDENT_START_MINUTES, dashboardReadingAt } from "@/lib/sim/pulseMetrics";
import { STUDY_RESOURCES } from "@/data/study-resources";
import { useCostStore, type ApiCallType } from "@/store/costStore";
import { useTaskflowStore } from "@/store/taskflowStore";

type ApiUsage = { inputTokens: number; outputTokens: number; model: string } | undefined;

function recordUsage(callType: ApiCallType, usage: ApiUsage) {
  if (!usage) return;
  useCostStore.getState().recordCall({ callType, model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
}

/** Channels where a player message should be graded by the evaluator agent.
 * #design-review is Maya's low-stakes design-question channel: graded by
 * the same evaluator/prompt as everywhere else, just under the #design-review
 * special case in EVALUATOR_PROMPT (handling/tone only, never the choice). */
const GRADED_CHANNELS = new Set<ChannelId>(["incidents", "dm_derek", "design-review"]);

/** A postmortem below this length is treated as ordinary chatter, not a
 * real submission; otherwise a stray short message sent in #incidents
 * after the prompt fires silently ends the day and gets scored as the
 * postmortem. */
const POSTMORTEM_MIN_LENGTH = 120;

/** Cheap, free pre-filter for "does this message look like a drafted
 * customer-facing template": only messages that match ever trigger the
 * real (paid) quality evaluator below. */
// Broadened after a live playtest miss: a well-written draft ("I'll write it
// in the incident channel... posted the customer-facing draft") slipped
// through the original narrower list because it didn't happen to use any of
// those exact phrases, silently skipping Feature A entirely and firing the
// wrong "CS wrote their own message" resolution narrative on a player who'd
// actually done the right thing. False positives here are cheap (one extra,
// harmless evaluator call); false negatives are not, so this errs wide.
/** Deterministic matcher for "the player's DM to Marcus actually engaged him
 * on the payout pipeline / rollback / payouts," used to set
 * marcusConsultedAtMinutes. THE RULE: the message must be to Marcus's DM AND
 * mention at least one payout/pipeline/rollback term below. A bare "hi",
 * "you around?", or an off-topic aside does NOT count as consulting him on the
 * consequence: only a message that actually touches the thing he could warn
 * about. Kept a plain regex (same pattern as CS_TEMPLATE_KEYWORDS) so it's
 * synchronous, deterministic, and adds no latency or model call. Asking Raj or
 * Priya to "check with Marcus" is deliberately OUT OF SCOPE for this signal:
 * detecting a third-party referral reliably would need name+intent parsing and
 * risks false positives, and the diligence beat is cleaner keyed on a direct
 * consult. Documented here rather than silently omitted. */
const MARCUS_PAYOUT_KEYWORDS =
  /payout|pay ?out|payment ?speed|roll ?back|rolling back|revert|pipeline|reconcil|double.?pay|duplicate|\bdupe|bank account|fast.?track|batch|seller/i;

const CS_TEMPLATE_KEYWORDS =
  /template|script|tell (the )?customers|copy.?paste|here'?s what|customer.facing|customer message|for (support|cs)\b|hand (my|your|her|his|their) team|use this (with|for)|what to tell|wording (for|to)|draft.*customer|customer.*draft/i;

/** B4: terms that mark a dm_priya reply as explicitly addressing the
 * seller-facing payout fallout, so it counts as the seller-comms attempt even
 * while the CS-template ask is still unhandled (the keyword only relaxes the
 * CS-priority gate; the substance floor in the detection block still applies).
 * Same plain-regex style as CS_TEMPLATE_KEYWORDS / MARCUS_PAYOUT_KEYWORDS:
 * synchronous, deterministic, no model call. */
const SELLER_COMMS_KEYWORDS = /seller|payout|pay ?out|cadence|delay/i;

/** Terms that mark a message to Derek in his DM as an actual incident briefing
 * (a recap of what happened / the blast radius) rather than off-topic chatter.
 * Used to record derekBriefedOnIncidentAtMinutes so Derek's 1:30 recap ask can
 * acknowledge an earlier rundown instead of cold re-asking for something the
 * player already gave him. Deliberately anchored on
 * the incident's own nouns (Apple Pay / webhook / checkout / the ticket count /
 * root cause / resolution) so a bare "crazy morning, huh" doesn't count as a
 * briefing. Same plain-regex style as the matchers above: synchronous,
 * deterministic, no model call. */
const DEREK_BRIEF_KEYWORDS =
  /stripe|apple ?pay|webhook|checkout|blast ?radius|root ?cause|what happened|incident|tickets?|failed payment|success rate|resolved|recap|postmortem|impact|affected/i;

/** Terms that mark a message to Raj (his DM or #incidents) as substantively
 * about the incident or the rollback-vs-patch-forward fix, so it counts as
 * engaging him on the call rather than morning small talk. Used to set
 * tradeoffEngagedWithRajAtMinutes so Raj's and Derek's fallback-escalation
 * beats don't assert "couldn't reach the PM" when the player was in an active
 * thread with Raj. Same plain-regex style as the matchers above: synchronous,
 * deterministic, no model call. */
const TRADEOFF_ENGAGEMENT_KEYWORDS =
  /stripe|apple ?pay|checkout|webhook|roll ?back|rollback|patch|payout|fix|tickets?|incident/i;

/** Sim-clock minute at/after which Raj kicks off his own reasoned fallback
 * decision on the fix tradeoff, once his offer has fired and the player still
 * hasn't decided. 605 = 10:05 AM: a point where the player has clearly gone
 * quiet, and early enough that the async call comfortably resolves before
 * Derek's 10:20 escalation would deliver even under +15m clock jumps. */
const RAJ_FALLBACK_KICKOFF_MINUTES = 605;

/** Static, per-choice fallback copy that is guaranteed consistent with the
 * structured `choice` field. Used two ways: (1) the rollback entry backs the
 * whole-decision API-failure fallback (SCRIPTED_RAJ_FALLBACK below), and (2)
 * both entries back reconcileRajFallback's consistency guard: when the model's
 * free-text argues for the OPPOSITE fix from the choice it returned, we keep the
 * structured choice (it drives real state) and swap in the matching entry's
 * reasoning + derekLine so the narrative can't contradict the state. Both texts
 * argue strictly FOR their own key's fix; reasoning never names Derek in the
 * third person (it may be relayed BY Derek). */
const STATIC_RAJ_FALLBACK_COPY: Record<
  "rollback" | "patch-forward",
  { reasoning: string; derekLine: string }
> = {
  rollback: {
    reasoning:
      "Couldn't reach you and buyers are still failing checkout, so I made the call. Went with the rollback since it's the known-good fix and I can get it in fast. We lose last week's faster seller payouts for now, but I'd rather stop the bleeding and sort payout speed back out once this is stable.",
    derekLine:
      "Going with the rollback. It's the sure fix and I can't sit on this while checkout's bleeding, so I'm starting now.",
  },
  "patch-forward": {
    reasoning:
      "Couldn't reach you and buyers are still failing checkout, so I made the call. Went patch-forward to keep last week's faster seller payouts live, so nobody in today's fast-track batch gets pushed back. The tradeoff is I couldn't reproduce the exact Stripe failure, so I'm accepting the first ship might not fully cover it and I may need a second pass.",
    derekLine:
      "Going patch-forward. It keeps the faster payouts whole for sellers and the only real cost is it's on me if the first ship needs a follow-up pass. Starting now.",
  },
};

/** Deterministic fallback for Raj's decision used ONLY when the model route
 * fails outright (network error / malformed response), never on the happy
 * path. Documented as the API-failure path so the escalation still fires with
 * a coherent scripted reasoning line instead of silently vanishing. Both
 * choices are legitimate; rollback is picked here purely as the deterministic
 * degenerate case, not a house preference. `decidedAtMinutes` is filled in by
 * the caller at resolution time. */
const SCRIPTED_RAJ_FALLBACK: { choice: "rollback"; reasoning: string; derekLine: string } = {
  choice: "rollback",
  ...STATIC_RAJ_FALLBACK_COPY.rollback,
};

/** Keyword tests over Raj's fallback free-text: which fix does the prose argue
 * for? Deliberately cheap and one-directional per pattern. */
const RAJ_FALLBACK_ROLLBACK_TEXT = /roll(ing)? ?back|\brollback\b|revert(ing|ed)?|old (webhook|retry|cadence)/i;
const RAJ_FALLBACK_PATCH_TEXT =
  /patch[- ]?forward|patch(ing)? (it|the|forward)|keep(ing)? (the )?(faster )?payout|faster payouts?|forward fix/i;

/** Deterministic consistency guard for Raj's fallback decision. The structured
 * `choice` drives real state (the Taskflow ticket, Pulse recovery, applyEffect),
 * while reasoning/derekLine drive only narrative, so if the model returns a
 * choice whose own free-text clearly argues for the OPPOSITE fix, the two halves
 * of the world split (Derek relays "the rollback" over reasoning that says "going
 * patch-forward"). When the combined text points unambiguously the other way,
 * keep the structured choice and swap in static, choice-consistent copy. Merely
 * ambiguous text (neither pattern, or BOTH) is left untouched: no retry, no
 * model call. */
function reconcileRajFallback(d: {
  choice: "rollback" | "patch-forward";
  reasoning: string;
  derekLine: string;
}): { choice: "rollback" | "patch-forward"; reasoning: string; derekLine: string } {
  const text = `${d.reasoning} ${d.derekLine}`;
  const saysRollback = RAJ_FALLBACK_ROLLBACK_TEXT.test(text);
  const saysPatch = RAJ_FALLBACK_PATCH_TEXT.test(text);
  const clearlyOpposite =
    (d.choice === "rollback" && saysPatch && !saysRollback) ||
    (d.choice === "patch-forward" && saysRollback && !saysPatch);
  if (!clearlyOpposite) return d;
  return { choice: d.choice, ...STATIC_RAJ_FALLBACK_COPY[d.choice] };
}

export const ASK_CLAUDE_OPENER =
  "Ask me about any term or concept from today (HTTP codes, webhooks, business metrics, whatever's unfamiliar). I can't tell you what to say or do in the scenario, that part's yours to practice. But I'm happy to explain the vocabulary.";

/** The fix engineers who ping when the fix lands: the non-adjacent registry
 * DM contacts (Jordan lead, Chen support). Derived from DM_CONTACTS so a future
 * fix engineer needs no change here, and so it can't drift from the follow-up
 * block's own `role !== "adjacent"` filter. */
const FIX_ENGINEER_AGENT_IDS = DM_CONTACTS.filter((c) => c.role !== "adjacent").map((c) => c.agentId);

/**
 * The single fix engineer responsible for the guaranteed "fix landed" ping when
 * the player never DMed a fix engineer directly, i.e. the promise was made
 * through Raj ("I'll have Jordan ping you"), or Raj made the fix call himself on
 * the fallback path. Prefers the Taskflow fix-ticket assignee IF the player put
 * a real fix engineer (jordan/chen) on the ticket; otherwise the engineer the
 * narrative put on the fix (the registry lead, Jordan). Returns a registry DM
 * contact so the ping reuses buildFixLandedFollowUp + the follow-up block's own
 * delivery / fixLandedFollowUpsSent / commitment-settle machinery unchanged, and
 * lands in that engineer's own DM (whose availability is already open once a fix
 * path exists). Returns null only if no fix engineer is registered at all (can't
 * happen with the current DM_CONTACTS). The caller then sends nothing rather
 * than inventing a sender, since Raj is not a registry DM contact. */
function resolveResponsibleFixEngineer(tradeoffTicketId: string | null): DmContact | null {
  const engineers = DM_CONTACTS.filter((c) => c.role !== "adjacent");
  const assigneeId = tradeoffTicketId
    ? (useTaskflowStore.getState().tickets.find((t) => t.id === tradeoffTicketId)?.assigneeId ?? null)
    : null;
  const assigned = assigneeId ? engineers.find((c) => c.agentId === assigneeId) : undefined;
  if (assigned) return assigned;
  return engineers.find((c) => c.role === "lead") ?? engineers[0] ?? null;
}

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

interface SimState {
  sessionId: string;
  day: number;
  clockMinutes: number;
  started: boolean;
  dayComplete: boolean;
  /** Whether the player has dismissed the full-screen DayScorecard overlay
   * for the current dayComplete. Persisted alongside dayComplete (see
   * sessionPersistence.ts) so reloading a completed day doesn't re-show the
   * overlay and eat StatusBar clicks (QA finding #12b). It was previously
   * component-local state in Desktop.tsx that reset to false on every mount. */
  scorecardDismissed: boolean;
  messages: Message[];
  stateBag: StateBag;
  firedEventIds: Set<string>;
  evaluations: Record<string, Evaluation>;
  helpQueries: HelpQuery[];
  activeChannel: ChannelId;
  pendingReplyFrom: AgentId | null;
  /** Which channel pendingReplyFrom's reply is actually landing in: without
   * this, the typing indicator would show up in whatever channel the player
   * happens to be looking at, not necessarily the one the reply belongs to,
   * if they switch channels while a reply is in flight. */
  pendingReplyChannel: ChannelId | null;
  unreadChannels: Set<ChannelId>;
  /** Ids of fired scenario events that required a response and haven't
   * gotten one yet: drives the Chattr taskbar badge and escalation checks. */
  pendingResponseIds: Set<string>;
  /** Ask Claude's conversation: lives here (not component state) so
   * closing/reopening the window doesn't lose the thread. */
  askClaudeMessages: AskClaudeMessage[];
  askClaudePending: boolean;
  /** One record per completed day, most recent last: powers the
   * end-of-day popup and the Reviews app off the same data. */
  dayRecords: DayScorecardRecord[];
  /** The player's own free-form scratchpad, never AI-touched. */
  notesText: string;
  /** Gates ambient-help UI (e.g. the fact checklist) that only some
   * difficulty tiers show. Not read by scoring or NPC behavior. */
  difficulty: Difficulty;
  /** Purely-for-fun discoveries logged across the whole session (top-level,
   * not nested in stateBag, since stateBag is conceptually "this day's live
   * state"; this is meant to accumulate the way dayRecords does). NEVER
   * read by computeScorecard or anything scoring-related (see the
   * discovery-detection block in sendPlayerMessage for the one place this
   * gets written). */
  easterEggsFound: EasterEggDiscovery[];
  /** Transient (not persisted in stateBag): true while Raj's fallback-decision
   * model call is in flight, so advanceClock kicks it off exactly once. Lives
   * on the store, not the state bag, because it's an in-progress-request guard,
   * not part of the day's saved state. */
  rajFallbackInFlight: boolean;
  /** Transient (not persisted): true while the 9:00 standup call overlay is on
   * screen. UI-plumbing only, like a modal-open flag, so it's reset to false on
   * restore rather than persisted (a refresh mid-call just lands back on the
   * desktop; the Join affordance reappears if still before 9:15 and unattended).
   * The DURABLE fact — whether the player attended — lives in
   * stateBag.standupAttended. */
  standupCallOpen: boolean;

  startDay: () => void;
  setActiveChannel: (channel: ChannelId) => void;
  advanceClock: (minutes: number) => void;
  sendPlayerMessage: (channel: ChannelId, content: string) => Promise<void>;
  logHelpQuery: (question: string, topicTag: string | null) => void;
  sendAskClaudeMessage: (content: string) => Promise<void>;
  recordDayScorecard: (day: number, postmortemText: string) => void;
  /** Rewards actually closing the postmortem-to-Taskflow loop (see
   * FollowUpTicketPrompt). Patches the already-recorded day's scorecard
   * reactively (same pattern as the async coordination-score merge just
   * below), not a new scoring pass, since the ticket is created after the
   * scorecard's already been computed and shown. */
  recordFollowUpTicket: (day: number, ticketTitle: string) => void;
  setNotesText: (text: string) => void;
  setDifficulty: (difficulty: Difficulty) => void;
  setPlayerName: (name: string) => void;
  /** Sets the player's chosen avatar sprite id (see PLAYER_SPRITES in
   * PixelAvatar.tsx), captured alongside setPlayerName on the orientation
   * screen. */
  setPlayerAvatarId: (id: string) => void;
  recordDocOpened: (docId: string) => void;
  dismissScorecard: () => void;
  /** Player accepted the 9:00 standup call: open the call overlay AND mark the
   * day's standupAttended durably (entering counts as attending, so the 9:15
   * #general fallback digest is suppressed on this path). Idempotent. */
  joinStandup: () => void;
  /** Player left the standup call: close the overlay and — once, on the join
   * path — post the standup summary to #general and save the "Standup Notes,
   * Day 1" doc into sessionDocs, both from the same continuity-conditioned
   * source the fallback digest uses. Re-entrancy/double-fire safe. */
  leaveStandup: () => void;
}

// Alias, not a reimplementation: formatSimClock in timeOfDay.ts is the
// shared H:MM AM/PM formatter. Keeping the `formatSimTime` export name here
// since other modules already import it from this store.
const formatSimTime = formatSimClock;

async function requestAgentReply(
  agentId: AgentId,
  history: Message[],
  state: StateBag,
  opts?: {
    reactingTo?: AgentId;
    callType?: ApiCallType;
    easterEggDiscovered?: boolean;
    /** A different channel's real transcript this agent has independent
     * visibility into (see groundingContextLine in prompts.ts). */
    groundingChannelLabel?: string;
    groundingTranscript?: { senderId: string; content: string }[];
    /** Pre-built established-state block appended to the system prompt as-is
     * (e.g. an assigned engineer's live fix status). */
    personaContext?: string;
    /** Current sim-clock minute, and the present participants in the channel
     * being replied in (see presentInChannel). Threaded to the reply route for
     * an upcoming subtask (A3/A4) that makes replies elapsed-time- and
     * roster-aware; they don't affect the prompt or output today. */
    clockMinutes?: number;
    channelRoster?: AgentId[];
  }
): Promise<string | null> {
  try {
    const res = await fetch("/api/agents/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        // sentAtSimMinutes now travels with each history entry (previously
        // stripped here). Consumed by an upcoming subtask; harmless to the
        // current route, which reads only senderId/content.
        history: history.map((m) => ({
          senderId: m.senderId,
          content: m.content,
          sentAtSimMinutes: m.sentAtSimMinutes,
        })),
        state,
        reactingTo: opts?.reactingTo,
        easterEggDiscovered: opts?.easterEggDiscovered,
        groundingChannelLabel: opts?.groundingChannelLabel,
        groundingTranscript: opts?.groundingTranscript,
        personaContext: opts?.personaContext,
        clockMinutes: opts?.clockMinutes,
        channelRoster: opts?.channelRoster,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    recordUsage(opts?.callType ?? "reply", data.usage);
    return data.content ?? null;
  } catch {
    return null;
  }
}

/** Stage B of the cross-functional gate (see src/lib/sim/crossFunctionalGate.ts
 * for Stage A, the free pre-filter that decides whether this gets called at all). */
async function requestCrossFunctionalGate(
  playerMessage: string,
  primaryAgentId: AgentId,
  primaryReply: string
): Promise<{ crossFunctional: boolean; secondAgent: AgentId | null; reason: string } | null> {
  try {
    const res = await fetch("/api/agents/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerMessage, primaryAgentId, primaryReply }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    recordUsage("gate", data.usage);
    return { crossFunctional: Boolean(data.crossFunctional), secondAgent: data.secondAgent ?? null, reason: data.reason ?? "" };
  } catch {
    return null;
  }
}

async function requestTradeoffEvaluation(
  offer: string,
  reply: string
): Promise<{ choice: "rollback" | "patch-forward" | "unclear"; hasReasoning: boolean; note: string } | null> {
  try {
    const res = await fetch("/api/agents/evaluate-tradeoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offer, reply }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    recordUsage("tradeoff", data.usage);
    return { choice: data.choice ?? "unclear", hasReasoning: Boolean(data.hasReasoning), note: data.note ?? "" };
  } catch {
    return null;
  }
}

/** Kicks off Raj's OWN reasoned fallback call on the fix tradeoff (rollback
 * vs. patch-forward) when the player has gone quiet (see the kickoff block in
 * advanceClock and RAJ_FALLBACK_DECISION_PROMPT). Goes through a real route (not
 * an inline model call) so the headless playtest harness exercises the same
 * path. Returns null on any failure; the caller then uses a deterministic
 * scripted fallback so the escalation still fires. Cost is recorded under the
 * existing "tradeoff" bucket since it's the same feature family. */
async function requestRajFallbackDecision(): Promise<{
  choice: "rollback" | "patch-forward";
  reasoning: string;
  derekLine: string;
} | null> {
  try {
    const res = await fetch("/api/agents/raj-fallback-decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    recordUsage("tradeoff", data.usage);
    if (data.choice !== "rollback" && data.choice !== "patch-forward") return null;
    if (typeof data.reasoning !== "string" || typeof data.derekLine !== "string") return null;
    // Guard against a model output whose free-text argues for the opposite fix
    // from the structured choice: keep the choice (it drives state), swap in
    // consistent copy only when the prose is unambiguously contradictory.
    return reconcileRajFallback({ choice: data.choice, reasoning: data.reasoning, derekLine: data.derekLine });
  } catch {
    return null;
  }
}

async function requestCsTemplateEvaluation(
  draft: string,
  transcript: { senderId: string; channel: string; content: string; sentAtSimMinutes: number }[]
): Promise<{ good: boolean; note: string } | null> {
  try {
    const res = await fetch("/api/agents/evaluate-cs-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft, transcript }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    recordUsage("cs-template", data.usage);
    return { good: Boolean(data.good), note: data.note ?? "" };
  } catch {
    return null;
  }
}

async function requestHelp(
  history: AskClaudeMessage[]
): Promise<{ answer: string; topicTag: string | null } | null> {
  try {
    const res = await fetch("/api/help", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        history: history.map((m) => ({ senderId: m.senderId, content: m.content })),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    recordUsage("help", data.usage);
    return data;
  } catch {
    return null;
  }
}

async function requestEvaluation(
  playerMessage: string,
  channel: ChannelId,
  transcript: { senderId: string; channel: string; content: string; sentAtSimMinutes: number; dashboard?: string }[],
  /** Deterministic, transcript-derived facts about how the player has
   * communicated this session (see deriveSessionObservations). Optional and
   * tone-only: the evaluate route uses them to frame feedback wording, never
   * to change any score. */
  observations?: string[]
) {
  try {
    const res = await fetch("/api/agents/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerMessage, channel, transcript, observations }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    recordUsage("evaluate", data.usage);
    return data;
  } catch {
    return null;
  }
}

async function fetchStudyAreaMatches(
  helpQueries: HelpQuery[],
  coachingNotes: string[]
): Promise<{ matchedTopicKeys: string[]; additionalTopics: string[] }> {
  try {
    const res = await fetch("/api/agents/study-areas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questions: helpQueries.map((q) => ({ question: q.question, topicTag: q.topicTag })),
        coachingNotes,
        knownTopics: STUDY_RESOURCES.map((r) => ({ topicKey: r.topicKey, topicLabel: r.topicLabel })),
      }),
    });
    if (!res.ok) return { matchedTopicKeys: [], additionalTopics: [] };
    const data = await res.json();
    recordUsage("study-areas", data.usage);
    return data;
  } catch {
    return { matchedTopicKeys: [], additionalTopics: [] };
  }
}

async function fetchCoordinationScore(
  transcript: { senderId: string; channel: string; content: string; sentAtSimMinutes: number }[]
): Promise<{ score: number | null; note: string }> {
  try {
    const res = await fetch("/api/agents/evaluate-coordination", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    if (!res.ok) return { score: null, note: "" };
    const data = await res.json();
    recordUsage("coordination", data.usage);
    return {
      score: typeof data.score === "number" ? data.score : null,
      note: typeof data.note === "string" ? data.note : "",
    };
  } catch {
    return { score: null, note: "" };
  }
}

/** Day-end score-explanation summarizer (subtask C1): turns the five final
 * scores + the internal grader notes + the full transcript into five
 * per-category, evidence-backed explanations with code-validated verbatim
 * quotes. Fired after the coordination score resolves so crossFunctional is
 * already its final value, and patched into dayRecords the same race-tolerant
 * way as the coordination and study-area merges. */
async function fetchScoreExplanations(
  transcript: { senderId: string; channel: string; content: string; sentAtSimMinutes: number }[],
  scores: ScorecardScores,
  graderNotes: { label?: string; feedback: string }[]
): Promise<CategoryExplanation[] | null> {
  try {
    const res = await fetch("/api/agents/explain-scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, scores, graderNotes }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    recordUsage("explain-scores", data.usage);
    return Array.isArray(data.explanations) ? data.explanations : null;
  } catch {
    return null;
  }
}


export const useSimStore = create<SimState>((set, get) => ({
  sessionId: crypto.randomUUID(),
  day: 1,
  clockMinutes: 510,
  started: false,
  dayComplete: false,
  scorecardDismissed: false,
  messages: [],
  stateBag: { ...initialStateBag },
  firedEventIds: new Set(),
  evaluations: {},
  helpQueries: [],
  // Opens on Derek's 8:30 AM welcome DM (derek-welcome-dm, day1-scenario.ts)
  // rather than #general, so the first thing a fresh session sees is his
  // welcome instead of it sitting hidden behind an unread dot. Restored
  // sessions overwrite this with their saved channel (sessionPersistence.ts).
  activeChannel: "dm_derek",
  pendingReplyFrom: null,
  pendingReplyChannel: null,
  unreadChannels: new Set(),
  pendingResponseIds: new Set(),
  askClaudeMessages: [{ id: makeId("help"), senderId: "assistant", content: ASK_CLAUDE_OPENER }],
  askClaudePending: false,
  dayRecords: [],
  notesText: "",
  difficulty: "easy",
  easterEggsFound: [],
  rajFallbackInFlight: false,
  standupCallOpen: false,

  startDay: () => {
    if (get().started) return;
    set({ started: true });
    get().advanceClock(0);
  },

  setActiveChannel: (channel) => {
    set((s) => {
      const unread = new Set(s.unreadChannels);
      unread.delete(channel);
      return { activeChannel: channel, unreadChannels: unread };
    });
  },

  advanceClock: (minutes) => {
    const dayEndMinutes = DAY_END_MINUTES[get().day];
    // Hard clamp: the clock can never advance past end-of-day, regardless
    // of how many times "+15m" gets clicked (previously unbounded: observed
    // reaching well past midnight with no end-of-day behavior at all).
    set((s) => ({
      clockMinutes: dayEndMinutes !== undefined ? Math.min(s.clockMinutes + minutes, dayEndMinutes) : s.clockMinutes + minutes,
    }));

    const { clockMinutes, stateBag, firedEventIds, activeChannel } = get();
    const due = day1ScenarioEvents
      .filter((e) => !firedEventIds.has(e.id))
      .filter((e) => e.triggerTimeMinutes <= clockMinutes)
      .filter((e) => !e.condition || e.condition(stateBag))
      .sort((a, b) => a.triggerTimeMinutes - b.triggerTimeMinutes);

    if (due.length > 0) {
      set((s) => {
        const newMessages: Message[] = due.map((e) => ({
          id: makeId("evt"),
          channel: e.channel,
          senderId: e.agentId,
          // contentFor renders state-dependent text (e.g. Derek relaying Raj's
          // actual fallback reasoning); falls back to the static string. Read
          // off s.stateBag, which already reflects the resolved fallback
          // decision by the time this beat's condition let it into `due`.
          content: e.contentFor ? e.contentFor(s.stateBag) : e.content,
          sentAtSimMinutes: e.triggerTimeMinutes,
          createdAt: Date.now(),
          attachment: e.attachment,
          attachments: e.attachments,
        }));

        const fired = new Set(s.firedEventIds);
        due.forEach((e) => fired.add(e.id));

        const pendingResponses = new Set(s.pendingResponseIds);
        due.forEach((e) => {
          if (e.requiresResponse) pendingResponses.add(e.id);
        });

        let nextStateBag = { ...s.stateBag };
        due.forEach((e) => {
          if (e.applyEffect) nextStateBag = { ...nextStateBag, ...e.applyEffect(nextStateBag) };
        });

        // The incident auto-resolves at 11 AM regardless of whether the
        // player ever made the explicit rollback-vs-patch-forward call.
        // The resolution message reports a fix shipped either way. If
        // tradeoffChoice is still null when that fires, default it to
        // patch-forward (the resolution copy describes a fix being shipped
        // in place, not a rollback) so every reader of this one field
        // (Office's engineer assignments, Pulse's recovery curve) reflects
        // the auto-resolve outcome instead of staying frozen in a
        // pre-decision state that contradicts what the player was just told.
        const resolutionEvent = due.find((e) => e.id === "resolution-good" || e.id === "resolution-cold");
        if (resolutionEvent && nextStateBag.tradeoffChoice === null) {
          nextStateBag = {
            ...nextStateBag,
            tradeoffChoice: "patch-forward",
            tradeoffDecidedAtMinutes: resolutionEvent.triggerTimeMinutes,
          };
        }

        const unread = new Set(s.unreadChannels);
        due.forEach((e) => {
          if (e.channel !== activeChannel) unread.add(e.channel);
        });

        return {
          messages: [...s.messages, ...newMessages],
          firedEventIds: fired,
          pendingResponseIds: pendingResponses,
          stateBag: nextStateBag,
          unreadChannels: unread,
        };
      });

      // Feature C hooks: seed/move tickets off the same scripted beats,
      // so the board has real narrative continuity rather than starting
      // empty until the tradeoff decision. Two tickets: an early
      // investigation one that paces To Do -> In Progress -> Done across
      // three separate beats (escalation, diagnosis, tradeoff-offer) so the
      // player actually feels the wait on a real answer rather than seeing
      // it resolve in one +15m step, and the specific fix ticket the
      // tradeoff decision (Feature B) seeds separately.
      if (due.some((e) => e.id === "priya-incidents-escalation")) {
        useTaskflowStore.getState().addTicket(
          "Investigate Apple Pay checkout failures",
          "Priya flagged a spike in failed-payment tickets. Find out what's actually breaking.",
          due.find((e) => e.id === "priya-incidents-escalation")!.triggerTimeMinutes,
          "todo",
          { kind: "story", reporterId: "priya" }
        );
      }
      // Raj's diagnosis (9:20) means the ticket is being worked, not
      // resolved: In Progress, not Done, and handed to Raj since he's the
      // one who just diagnosed it. Only acts on a ticket still sitting in
      // To Do, and only assigns if nobody's assigned it yet: if the player
      // already moved or assigned it themselves, don't fight them. Only
      // auto-advance forward, never backward.
      if (due.some((e) => e.id === "raj-diagnosis")) {
        const investigating = useTaskflowStore.getState().tickets.find((t) => t.status === "todo" && t.title.startsWith("Investigate"));
        if (investigating) {
          useTaskflowStore.getState().moveTicket(investigating.id, "in-progress");
          if (!investigating.assigneeId) {
            useTaskflowStore
              .getState()
              .assignTicket(investigating.id, "raj", due.find((e) => e.id === "raj-diagnosis")!.triggerTimeMinutes);
          }
        }
      }
      // Done only lands once Raj has moved from diagnosing to actually
      // proposing a fix (raj-tradeoff-offer, 9:38): at least one +15m
      // advance after In Progress, so the wait is genuinely felt. Same
      // forward-only guard: only fires on a ticket still In Progress, so a
      // player-driven move isn't overridden.
      if (due.some((e) => e.id === "raj-tradeoff-offer")) {
        const investigating = useTaskflowStore.getState().tickets.find((t) => t.status === "in-progress" && t.title.startsWith("Investigate"));
        if (investigating) useTaskflowStore.getState().moveTicket(investigating.id, "done");
      }
      if (due.some((e) => e.id === "resolution-good" || e.id === "resolution-cold")) {
        // By id, not "whichever ticket happens to be in-progress": the
        // latter breaks the moment the player has moved anything else
        // (e.g. a freeform ticket) into in-progress themselves, which
        // would otherwise get swept to "done" instead of the actual fix
        // ticket. See tradeoffTicketId's doc comment in types.ts.
        const ticketId = get().stateBag.tradeoffTicketId;
        if (ticketId) useTaskflowStore.getState().moveTicket(ticketId, "done");
      }
    }

    // Fix-landed follow-up DMs. When the chosen fix actually lands (the shared
    // timeline's landedAt is reached), any registry engineer the player DMed
    // before landing sends a one-time, grounded follow-up ping: the promise
    // an engineer may make in conversation, now actually kept by the system.
    // Timestamped at the REAL landing minute (timeline.landedAt), not the
    // current clock, so a +15m jump straight past landing still produces a
    // truthful transcript. The fixLandedFollowUpsSent guard fires it exactly
    // once per contact and never before landing (landedAt is null until then).
    {
      const { clockMinutes: nowMinutes, stateBag: sb, firedEventIds: fired, messages: msgs } = get();
      const timeline = getIncidentTimeline({ stateBag: sb, firedEventIds: fired, clockMinutes: nowMinutes });
      if (timeline.landedAt !== null) {
        const landedAt = timeline.landedAt;
        const alreadySent = sb.fixLandedFollowUpsSent ?? [];
        // A contact is due iff the player DMed them at or before the real
        // landing minute (so a contact first DMed AFTER landing gets no
        // retroactive ping) and hasn't already been sent one.
        let due = DM_CONTACTS.filter(
          (c) =>
            // Only the incident-fix engineers ping when the fix lands. Marcus
            // (role "adjacent") is on the payout pipeline, never the fix, so he
            // has no fix-landed follow-up to send.
            c.role !== "adjacent" &&
            !alreadySent.includes(c.id) &&
            msgs.some(
              (m) => m.senderId === "player" && m.channel === dmChannelId(c.id) && m.sentAtSimMinutes <= landedAt
            )
        );
        // Guaranteed delivery (QA #3). The filter above only pings a fix
        // engineer the player DMed DIRECTLY before landing. But the promised
        // ping is very often made THROUGH Raj ("go patch-forward, ping me the
        // moment it's live" -> "Got it, I'll have Jordan ping you") entirely in
        // Raj's DM, with Jordan/Chen's own DMs never opened, and on the
        // Raj-fallback path the player was absent for the decision altogether.
        // In both cases the direct-DM filter is empty and the promise would drop
        // silently (the live repro: Jordan's DM stayed empty, no ping ever
        // arrived). So when nothing is due directly, fall back to a single ping
        // from the engineer actually on the fix (the Taskflow assignee if the
        // player put a real fix engineer on the ticket, else the narrative lead
        // Jordan), delivered in that engineer's own DM. Still one-time (the
        // alreadySent guard) and still only after real landing (the whole block
        // is gated on timeline.landedAt !== null), and additive to Raj's
        // #incidents all-clear, never a replacement for it.
        if (due.length === 0) {
          const responsible = resolveResponsibleFixEngineer(sb.tradeoffTicketId);
          if (responsible && !alreadySent.includes(responsible.id)) {
            due = [responsible];
          }
        }
        if (due.length > 0) {
          const followUps: Message[] = due.map((c) => ({
            id: makeId("msg"),
            channel: dmChannelId(c.id),
            senderId: c.agentId,
            content: buildFixLandedFollowUp(c, timeline),
            sentAtSimMinutes: landedAt,
            createdAt: Date.now(),
          }));
          set((s) => {
            const unread = new Set(s.unreadChannels);
            followUps.forEach((m) => {
              if (m.channel !== s.activeChannel) unread.add(m.channel);
            });
            // Settle each pinging engineer's "will report when the fix lands"
            // commitment now that the ping has actually gone out: the promise
            // is kept. Idempotent; a no-op for any contact that never had one
            // (e.g. a fallback/auto-resolve path where the append site didn't run).
            const settledLedger = due.reduce(
              (ledger, c) => settleFixEngineerCommitment(ledger, c.agentId),
              s.stateBag.commitmentLedger
            );
            return {
              messages: [...s.messages, ...followUps],
              unreadChannels: unread,
              stateBag: {
                ...s.stateBag,
                fixLandedFollowUpsSent: [...(s.stateBag.fixLandedFollowUpsSent ?? []), ...due.map((c) => c.id)],
                commitmentLedger: settledLedger,
              },
            };
          });
        }
      }
    }

    // NPC-initiated follow-up obligations (A2). After the scripted events and
    // the fix-landed pings, evaluate every pending obligation against live
    // state. Each fires ONLY when its declarative trigger's condition is
    // actually true right now (state-conditional, never a fixed clock), and
    // settles silently when its cancel condition beat it (see obligations.ts
    // for the fire/cancel-by-sim-time semantics). Mirrors the fix-landed block:
    // append the NPC messages (timestamped at the minute their condition became
    // true, straight off the engine), mark unread if not the active channel,
    // and flip obligation status in the SAME set(). Re-entrancy-safe: the
    // engine only ever acts on "pending" entries, and firing flips them to
    // fulfilled/cancelled in that same set(), so a re-entrant advanceClock (the
    // Raj-fallback path re-runs advanceClock(0)) can't double-fire.
    {
      const { clockMinutes: nowMinutes, stateBag: sb, firedEventIds: fired } = get();
      const pending = sb.pendingObligations ?? [];
      if (pending.some((o) => o.status === "pending")) {
        const timeline = getIncidentTimeline({ stateBag: sb, firedEventIds: fired, clockMinutes: nowMinutes });
        const result = evaluateObligations(pending, {
          clockMinutes: nowMinutes,
          landedAtMinutes: timeline.landedAt,
          fullyRecoveredAtMinutes: timeline.fullyRecoveredAt,
          incidentDeclaredAtMinutes: timeline.incidentDeclaredAt,
          decidedAtMinutes: timeline.decidedAt,
          resolutionAnnouncedAtMinutes: timeline.resolutionAnnouncedAt,
          csTemplateAttemptedAtMinutes: sb.csTemplateAttemptedAtMinutes ?? null,
          // Maya's design-followup cancel signal: the minute the player answered
          // her 12:30 ask, straight off the existing requiresResponse record for
          // that event (no new StateBag fact, no sendPlayerMessage change).
          mayaDesignRespondedAtMinutes: sb.respondedAtMinutes["maya-design-question"] ?? null,
        });
        if (result.changed) {
          const firedMessages: Message[] = result.firings.map((f) => ({
            id: makeId("msg"),
            channel: f.channel,
            senderId: f.agentId,
            content: buildObligationMessageContent(f.kind, timeline),
            sentAtSimMinutes: f.sentAtSimMinutes,
            createdAt: Date.now(),
          }));
          // B4: fire-time ledger append. When Priya's seller-comms ask fires, a
          // "player-owes-npc" entry must be appended so her later replies treat
          // the seller note as an outstanding thing the player owes. Wired HERE,
          // in the store block that renders firings, keyed on the firing's kind,
          // NOT in obligations.ts, which stays a types-only leaf with no
          // commitments dependency (the same purity split A2 established: the
          // engine returns firing DESCRIPTORS, the store turns them into
          // messages/ledger writes). Idempotent by the entry's stable id.
          const sellerFiring = result.firings.find((f) => f.kind === "priya-seller-comms-ask");
          set((s) => {
            const unread = new Set(s.unreadChannels);
            firedMessages.forEach((m) => {
              if (m.channel !== s.activeChannel) unread.add(m.channel);
            });
            return {
              messages: [...s.messages, ...firedMessages],
              unreadChannels: unread,
              // Replace only pendingObligations; the engine computed it from the
              // snapshot taken at this block's start, and nothing else mutates
              // it synchronously between that read and here. Append the seller
              // owed-ledger entry in the same set() if the seller ask fired,
              // stamped at the minute its condition became true.
              stateBag: {
                ...s.stateBag,
                pendingObligations: result.nextObligations,
                commitmentLedger: sellerFiring
                  ? recordPlayerOwesSellerComms(s.stateBag.commitmentLedger, sellerFiring.sentAtSimMinutes)
                  : s.stateBag.commitmentLedger,
              },
            };
          });
        }
      }
    }

    // Raj's reasoned fallback decision. Once his tradeoff offer has fired and
    // the player has gone quiet past ~10:05 with no decision of their own, Raj
    // weighs the SAME established tradeoff himself via a real model call, so his
    // fallback varies run to run instead of being an identical hardcoded
    // rollback every disengaged playthrough. advanceClock is synchronous, so
    // this is fire-and-forget: kick the async call off (guarded to fire exactly
    // once and never after the player has decided), and when it lands, write the
    // decision and re-run advanceClock(0) so any now-due escalation delivers at
    // a truthful current-clock timestamp. Derek's 10:20 escalation is gated on
    // rajFallbackDecision existing (see day1-scenario.ts), so it holds rather
    // than firing on an empty decision if the call is still in flight when 10:20
    // is crossed.
    {
      const sb = get().stateBag;
      if (
        get().firedEventIds.has("raj-tradeoff-offer") &&
        sb.tradeoffChoice === null &&
        sb.rajFallbackDecision === null &&
        !get().rajFallbackInFlight &&
        get().clockMinutes >= RAJ_FALLBACK_KICKOFF_MINUTES
      ) {
        set({ rajFallbackInFlight: true });
        requestRajFallbackDecision().then((res) => {
          // The player may have decided (or a decision may have otherwise
          // landed) while the call was in flight; if so, drop this result so
          // the escalation never fires against a player who answered.
          const cur = get().stateBag;
          if (cur.tradeoffChoice !== null || cur.rajFallbackDecision !== null) {
            set({ rajFallbackInFlight: false });
            return;
          }
          const decidedAtMinutes = get().clockMinutes;
          const decision = res
            ? { ...res, decidedAtMinutes }
            : { ...SCRIPTED_RAJ_FALLBACK, decidedAtMinutes }; // API-failure path only
          set((s) => ({
            stateBag: { ...s.stateBag, rajFallbackDecision: decision },
            rajFallbackInFlight: false,
          }));
          // Deliver any now-due escalation immediately (e.g. the clock is
          // already past 10:20 because the call resolved late) at the current,
          // truthful clock rather than waiting for the next player action.
          get().advanceClock(0);
        });
      }
    }

    // Hard end-of-day boundary: once reached, the day ends automatically.
    // This applies regardless of whether the postmortem was ever submitted.
    // A postmortem submission (sendPlayerMessage) already sets dayComplete
    // itself, so this only ever fires for the "never submitted" outcome.
    if (!get().dayComplete && dayEndMinutes !== undefined && get().clockMinutes >= dayEndMinutes) {
      set({ dayComplete: true });
      get().recordDayScorecard(get().day, "");
    }
  },

  sendPlayerMessage: async (channel, content) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    // Snapshot BEFORE this message can clear anything: both of these need
    // to reflect what was pending when the player sent this, not what's
    // left after their own message just resolved the one thing that was
    // pending (same message satisfying its own channel's pending event is
    // the common case here, e.g. any #incidents reply to Priya's escalation).
    const pendingResponseCountAtSendTime = get().pendingResponseIds.size;
    const pendingChannelEventsAtSendTime = day1ScenarioEvents.filter(
      (e) => get().pendingResponseIds.has(e.id) && e.channel === channel
    );

    // Snapshot the Pulse dashboard reading as it stands right now, at this
    // message's send time, using the same inputs PulseMock reads off sim
    // state (see pulseMetrics). Stored on the message itself so every player
    // line carries the reading it was sent alongside, not just the graded
    // one: an earlier message may have cited an earlier reading, and the
    // evaluator's repetition rule needs to see that original figure to treat
    // it as grounded. Returns null (and stays off the message) before the
    // incident starts, when the reading is a bare zero worth nothing here.
    const sentAt = get().clockMinutes;
    const dashboardReading = dashboardReadingAt(sentAt, {
      incidentStartMinutes: get().firedEventIds.has("priya-incidents-escalation") ? INCIDENT_START_MINUTES : null,
      tradeoffChoice: get().stateBag.tradeoffChoice,
      tradeoffDecidedAtMinutes: get().stateBag.tradeoffDecidedAtMinutes,
    });

    const playerMsg: Message = {
      id: makeId("msg"),
      channel,
      senderId: "player",
      content: trimmed,
      sentAtSimMinutes: sentAt,
      createdAt: Date.now(),
      ...(dashboardReading ? { dashboard: dashboardReading } : {}),
    };
    set((s) => ({ messages: [...s.messages, playerMsg] }));

    // Diligence signal (Part 6): the first time the player DMs Marcus with a
    // message that actually touches the payout pipeline / rollback / payouts,
    // record when. This is what tells "the player foresaw the rollback's
    // downstream cost by asking the one engineer on that pipeline" apart from
    // "never asked." Deterministic (channel + keyword match), set once, and
    // deliberately separate from scoring/acknowledgment paths: it only feeds
    // the payout consequence beats and the diligence coaching note.
    if (
      channel === dmChannelId("marcus") &&
      get().stateBag.marcusConsultedAtMinutes === null &&
      MARCUS_PAYOUT_KEYWORDS.test(trimmed)
    ) {
      set((s) => ({ stateBag: { ...s.stateBag, marcusConsultedAtMinutes: playerMsg.sentAtSimMinutes } }));
    }

    // Tradeoff-engagement signal: the first substantive message the player
    // sends Raj (his DM or #incidents) about the incident/tradeoff BEFORE any
    // decision has landed. This is what tells "the PM went quiet
    // mid-conversation" apart from "we never reached the PM at all," so Raj's
    // and Derek's fallback-escalation beats don't assert a flat "couldn't reach
    // you" when the player was in an active DM thread with Raj about the very
    // same call. Gated on the incident being knowable (priya-heads-up-dm fired,
    // 8:45), NOT on Raj's 9:38 scripted tradeoff-offer beat: his live persona
    // routinely presents the rollback/patch options in dm_raj well before that
    // beat, and gating on it would miss that whole early thread. A keyword test
    // over incident/tradeoff nouns (plus the length floor) keeps morning small
    // talk from counting. Set once, additively: same shape as the Marcus
    // diligence signal above. Harmless if THIS message turns out to be the
    // decision itself: the tradeoff evaluator then sets tradeoffChoice non-null
    // and the escalation beats (gated on tradeoffChoice === null) never fire, so
    // the flag is moot.
    if (
      (channel === "dm_raj" || channel === "incidents") &&
      get().firedEventIds.has("priya-heads-up-dm") &&
      get().stateBag.tradeoffChoice === null &&
      get().stateBag.tradeoffEngagedWithRajAtMinutes === null &&
      trimmed.length >= 15 &&
      TRADEOFF_ENGAGEMENT_KEYWORDS.test(trimmed)
    ) {
      // Same transition also records the DISCUSSED-LEDGER entry that Raj has now
      // been over the fix with the player (rollback-vs-patch options), keyed off
      // this exact substantive-engagement signal. This is the mechanism that
      // lets a later scripted beat OR Raj's own free-form reply tell "we've
      // already gone over these options" apart from "first time." It's recorded
      // independent of whether a definite CHOICE ever classifies into
      // tradeoffChoice, which is precisely the confirmed re-explain hole: a DM
      // call the tradeoff evaluator read as "unclear" (or made before the gate
      // opened) left tradeoffChoice null, so the 9:38 offer, keyed only on
      // tradeoffChoice, cold re-presented the whole tradeoff. Idempotent by
      // stable id (re-entrancy-safe).
      set((s) => ({
        stateBag: {
          ...s.stateBag,
          tradeoffEngagedWithRajAtMinutes: playerMsg.sentAtSimMinutes,
          commitmentLedger: recordTopicDiscussed(s.stateBag.commitmentLedger, {
            agentId: "raj",
            topic: DISCUSSED_RAJ_INCIDENT_OPTIONS,
            channel,
            atSimMinutes: playerMsg.sentAtSimMinutes,
            summary:
              "You and the player have already been going back and forth on the incident fix (the rollback-vs-patch-forward call), so don't re-present those two options as if it's the first time.",
          }),
        },
      }));
    }

    // Derek-briefing signal: the player proactively recaps the incident TO
    // Derek in his DM BEFORE his 1:30 recap ask fires. This is what lets that
    // ask acknowledge an earlier rundown ("confirm the final numbers") instead
    // of cold re-asking for a blast radius the player already delivered him.
    // Restricted to dm_derek only: the ask's cold variant already frames itself
    // as "I saw the incident thread," so #incidents activity the player never
    // addressed to Derek is naturally covered without this fact, and posting
    // there no longer misfires his "thanks for the earlier rundown" variant.
    // Deterministic: a substantive message (same 40-char floor as the CS/seller
    // detectors) in dm_derek, after the incident was declared, that actually
    // names the incident's own nouns (DEREK_BRIEF_KEYWORDS) so off-topic
    // chatter doesn't count. Set once, additively; only meaningful while
    // derek-escalation hasn't fired yet (a briefing after the ask is just the
    // normal response path, tracked by respondedAtMinutes).
    if (
      channel === "dm_derek" &&
      get().firedEventIds.has("priya-incidents-escalation") &&
      !get().firedEventIds.has("derek-escalation") &&
      get().stateBag.derekBriefedOnIncidentAtMinutes === null &&
      trimmed.length >= 40 &&
      DEREK_BRIEF_KEYWORDS.test(trimmed)
    ) {
      set((s) => ({ stateBag: { ...s.stateBag, derekBriefedOnIncidentAtMinutes: playerMsg.sentAtSimMinutes } }));
    }

    // The postmortem is the player's own closing narrative beat, not a live
    // conversational message: it shouldn't trigger an NPC reply (Raj used
    // to sometimes generate a competing postmortem of his own here). This
    // also covers the case where THIS message's own trailing +3min advance
    // (below) is what crosses the postmortem-prompt trigger: otherwise a
    // closing message sent within ~3 sim-minutes of that trigger would slip
    // through as a "regular" message and still get a competing NPC reply.
    const postmortemAlreadyDue = day1ScenarioEvents.some(
      (e) => e.id === "postmortem-prompt" && e.triggerTimeMinutes <= get().clockMinutes + 3
    );
    // A short message here used to end the day on the spot: a stray "ok,
    // on it" (or anything short) sent in #incidents after the prompt fired
    // silently became the scored postmortem, with no pushback since NPC
    // replies are suppressed for a real submission. Below the length floor,
    // this instead falls through to a normal reactive reply (see below).
    const isPostmortemSubmission =
      channel === "incidents" &&
      !get().stateBag.postmortemSubmitted &&
      (get().firedEventIds.has("postmortem-prompt") || postmortemAlreadyDue) &&
      trimmed.length >= POSTMORTEM_MIN_LENGTH;

    // Clear any pending required-response events this message satisfies:
    // generically, by checking every channel that counts as answering that
    // specific event (see satisfyingChannels / ScenarioEvent.reAsks /
    // alsoSatisfiedByChannels), not just the event's own literal channel.
    // If the player blew past the event's own response deadline, flag it
    // for a one-time tone nudge in that agent's next reply: ambient
    // pressure, not a scored callout.
    const lateAgents: AgentId[] = [];
    const respondedNow: { id: string; sentAtSimMinutes: number }[] = [];
    set((s) => {
      if (s.pendingResponseIds.size === 0) return s;
      const pending = new Set(s.pendingResponseIds);
      let changed = false;
      day1ScenarioEvents.forEach((e) => {
        if (!pending.has(e.id)) return;
        if (!satisfyingChannels(e, day1ScenarioEvents).has(channel)) return;
        pending.delete(e.id);
        changed = true;
        respondedNow.push({ id: e.id, sentAtSimMinutes: playerMsg.sentAtSimMinutes });
        if (e.responseDeadlineMinutes !== undefined && playerMsg.sentAtSimMinutes > e.triggerTimeMinutes + e.responseDeadlineMinutes) {
          lateAgents.push(e.agentId);
        }
      });
      return changed ? { pendingResponseIds: pending } : s;
    });

    // Update state bag from the act of responding.
    set((s) => {
      const next: StateBag = { ...s.stateBag };
      if (respondedNow.length > 0) {
        next.respondedAtMinutes = { ...next.respondedAtMinutes };
        respondedNow.forEach(({ id, sentAtSimMinutes }) => {
          if (!(id in next.respondedAtMinutes)) next.respondedAtMinutes[id] = sentAtSimMinutes;
        });
      }
      if (lateAgents.length > 0) {
        next.lateResponseTo = { ...next.lateResponseTo };
        lateAgents.forEach((agentId) => {
          next.lateResponseTo[agentId] = true;
        });
      }
      return { stateBag: next };
    });

    // Discussed-ledger population (Priya side). Satisfying Priya's 8:45 heads-up
    // (priya-heads-up-dm) means the player has actually worked the checkout /
    // Apple Pay ticket spike WITH her: that event is only ever satisfiable by a
    // reply in her DM (no reAsks/alsoSatisfiedByChannels route it elsewhere), so
    // "responded" here is by construction a real back-and-forth with Priya about
    // the spike. Record it so the 9:00 standup digest and Priya's own free-form
    // replies build on that conversation ("like I flagged earlier") instead of
    // presenting the spike as brand-new. Idempotent by stable id, so a
    // re-entrant advanceClock / re-satisfied event can't double-append.
    {
      const priyaHeadsUp = respondedNow.find((r) => r.id === "priya-heads-up-dm");
      if (priyaHeadsUp) {
        set((s) => ({
          stateBag: {
            ...s.stateBag,
            commitmentLedger: recordTopicDiscussed(s.stateBag.commitmentLedger, {
              agentId: "priya",
              topic: DISCUSSED_PRIYA_TICKET_SPIKE,
              channel: "dm_priya",
              atSimMinutes: priyaHeadsUp.sentAtSimMinutes,
              summary:
                "You've already flagged the checkout / Apple Pay ticket spike to the player directly and they've engaged with you on it, so don't raise it as brand-new.",
            }),
          },
        }));
      }
    }

    // Easter eggs: purely-for-fun discoveries, deliberately kept separate
    // from the acknowledgment block above rather than folded into it: these
    // events never set requiresResponse (no deadline, no nudge if ignored),
    // so this reuses firedEventIds instead of pendingResponseIds, and a
    // reply in the egg's own channel any time after it fires counts (no
    // reAsks/alsoSatisfiedByChannels equivalence needed for something this
    // low-stakes). Writes ONLY to the top-level easterEggsFound array below:
    // never touches stateBag, evaluations, or anything computeScorecard
    // reads, by design. This is the one and only place that boundary could
    // leak, so it stays intentionally isolated from every scoring path.
    const newlyDiscoveredEggs = day1ScenarioEvents.filter(
      (e) =>
        e.easterEgg &&
        e.channel === channel &&
        get().firedEventIds.has(e.id) &&
        !get().easterEggsFound.some((d) => d.id === e.id)
    );
    if (newlyDiscoveredEggs.length > 0) {
      set((s) => ({
        easterEggsFound: [
          ...s.easterEggsFound,
          ...newlyDiscoveredEggs.map((e) => ({
            id: e.id,
            day: s.day,
            discoveredAtSimMinutes: playerMsg.sentAtSimMinutes,
            label: e.easterEgg!.label,
          })),
        ],
      }));
    }

    // B4: snapshot whether Priya's CS-template ask was already handled by a
    // PRIOR message, taken BEFORE this message's CS-template block below can set
    // csTemplateAttemptedAtMinutes for the CURRENT message. The seller-comms
    // detection block (further below) reads this so one send can't count as both
    // a CS attempt (via its length path) and a seller attempt: "once the CS
    // template has been handled" means handled by an earlier message, not by this
    // one. See the seller block's disambiguation note.
    const csHandledBeforeThisMessage =
      get().stateBag.csTemplateAttemptedAtMinutes !== null || get().stateBag.csTemplateProvided;

    // Feature A (CS template): csTemplateProvided means "provided AND
    // good," not just "attempted." Awaited (not fire-and-forget) because
    // this flag gates which of the two resolution messages fires, and that
    // firing is time-based: it needs to be settled before this function's
    // own trailing advanceClock(3) could plausibly cross that boundary, not
    // resolved after the fact.
    //
    // Two ways into the real evaluator, not one, after CS_TEMPLATE_KEYWORDS
    // alone missed real drafts live twice ("I'll write it in the incident
    // channel", "give her something she can paste"; neither matched any
    // reasonable keyword list). In dm_priya, once she's actually asked for
    // this (priya-template-request fired), a substantial reply there has no
    // other plausible purpose: trust the channel + timing over guessing
    // phrasing. Elsewhere (#incidents, or dm_priya before she's asked), that
    // signal doesn't hold, so keep the keyword pre-filter to avoid grading
    // unrelated chatter.
    const dmPriyaAfterAsk =
      channel === "dm_priya" && get().firedEventIds.has("priya-template-request") && trimmed.length >= 40;
    if (
      (channel === "incidents" || channel === "dm_priya") &&
      !isPostmortemSubmission &&
      !get().stateBag.csTemplateProvided &&
      (dmPriyaAfterAsk || CS_TEMPLATE_KEYWORDS.test(trimmed))
    ) {
      // A2: record that the player ATTEMPTED a customer-facing draft (any
      // attempt, good or not, in either channel), before the async evaluation
      // so a failed evaluator call still counts. This is what settles Priya's
      // nudge/updated-context obligations silently: a mediocre draft must not
      // still draw a cold "still waiting" nudge. Distinct from csTemplateProvided
      // ("attempted AND good"); set once, additively. The next advanceClock tick
      // (this function's trailing advanceClock(3)) lets the obligation engine act.
      if (get().stateBag.csTemplateAttemptedAtMinutes === null) {
        set((s) => ({ stateBag: { ...s.stateBag, csTemplateAttemptedAtMinutes: playerMsg.sentAtSimMinutes } }));
      }
      const transcriptForTemplate = get().messages.map((m) => ({
        senderId: m.senderId,
        channel: m.channel,
        content: m.content,
        sentAtSimMinutes: m.sentAtSimMinutes,
      }));
      const templateResult = await requestCsTemplateEvaluation(trimmed, transcriptForTemplate);
      if (templateResult) {
        set((s) => ({
          stateBag: {
            ...s.stateBag,
            csTemplateProvided: templateResult.good,
            // Settle Priya's "player owes me a CS message" obligation only when
            // the delivered template actually passed (good), mirroring
            // csTemplateProvided's own "provided AND good" meaning. Idempotent
            // and a no-op if she never asked (entry absent).
            commitmentLedger: templateResult.good
              ? settlePlayerOwesCsTemplate(s.stateBag.commitmentLedger)
              : s.stateBag.commitmentLedger,
          },
        }));
        if (templateResult.note) {
          set((s) => ({
            evaluations: {
              ...s.evaluations,
              [`${playerMsg.id}-cs-template`]: {
                id: makeId("eval"),
                messageId: playerMsg.id,
                eventId: "cs-template",
                scores: { tone: 0, speed: 0, completeness: 0, strategicThinking: 0 },
                feedback: templateResult.note,
              },
            },
          }));
        }
      }
    }

    // B4: seller-facing comms detection + settlement. The seller counterpart
    // to the CS-template block above, and deliberately additive/self-contained
    // (the three documented bug-fix regions in this function stay untouched).
    // Once Priya's rollback-only seller-comms ask has FIRED (the
    // priya-seller-comms-ask obligation flips off "pending" the moment it
    // fires), a substantive dm_priya reply is read as the player attempting the
    // seller note: it sets sellerCommsAttemptedAtMinutes once (additively) and
    // settles the "player owes a seller note" ledger entry. No nudge/resolved
    // follow-up in this pass: the ask + owed-ledger + settlement is the scope.
    //
    // DISAMBIGUATION with the CS-template heuristic above (both watch dm_priya):
    //  - Substance floor first: a real attempt is >= 40 chars, matching the CS
    //    block's own dmPriyaAfterAsk floor. A bare "payouts?" never settles it.
    //  - While the CS template is still unhandled, the CS heuristic keeps
    //    priority (its ask came first at 9:26), so a plain substantive reply is
    //    read as the CS attempt, not the seller one. csHandledBeforeThisMessage
    //    (snapshotted above the CS block) is what enforces "handled by an EARLIER
    //    message," so this same send can't be double-counted through both paths.
    //  - Once the CS template has been handled by an earlier message, a
    //    substantive reply after the seller ask is the seller attempt.
    //  - A reply that explicitly names the seller/payout impact
    //    (SELLER_COMMS_KEYWORDS) is the seller attempt even if the CS template is
    //    still unhandled: the keyword only relaxes the CS-priority gate, never
    //    the substance floor. (The untouched CS block may still ALSO grade such a
    //    message as a CS attempt; that's pre-existing behavior and harmless here,
    //    since the two settlements are independent.)
    {
      const sellerAskFired = (get().stateBag.pendingObligations ?? []).some(
        (o) => o.kind === "priya-seller-comms-ask" && o.status !== "pending"
      );
      if (
        channel === "dm_priya" &&
        sellerAskFired &&
        get().stateBag.sellerCommsAttemptedAtMinutes === null &&
        trimmed.length >= 40 &&
        (SELLER_COMMS_KEYWORDS.test(trimmed) || csHandledBeforeThisMessage)
      ) {
        set((s) => ({
          stateBag: {
            ...s.stateBag,
            sellerCommsAttemptedAtMinutes:
              s.stateBag.sellerCommsAttemptedAtMinutes ?? playerMsg.sentAtSimMinutes,
            // Settle Priya's "player owes a seller note" entry. Idempotent and a
            // no-op if the ask never fired (entry absent), mirrors the
            // CS-template settlement's own guarantees.
            commitmentLedger: settlePlayerOwesSellerComms(s.stateBag.commitmentLedger),
          },
        }));
      }
    }

    // Feature B: rollback vs. patch-forward tradeoff. Awaited for the same
    // reason as the CS-template check above: tradeoffChoice/decidedAtMinutes
    // feed Pulse's recovery curve and the seeded Taskflow ticket, both of
    // which need this settled, not resolved after the fact.
    //
    // dm_raj is recognized alongside #incidents (A1 root-cause fix): a decision
    // stated privately to Raj now registers in state exactly as an #incidents
    // one does, instead of Raj roleplaying commitment in DM while state never
    // records it, which was why his #incidents persona later re-acknowledged
    // the same decision as brand new. A single message is only ever in one
    // channel, so this can't double-evaluate; tradeoffChoice === null stays the
    // master guard regardless.
    //
    // The readiness gate is priya-incidents-escalation (9:15 #incidents), NOT
    // the 9:38 raj-tradeoff-offer beat (fix 1c) and NOT raj-diagnosis (9:20).
    // Raj's live persona routinely surfaces the rollback/patch options in dm_raj
    // well before the scripted 9:38 offer, and readily ACCEPTS an explicit early
    // call ("go patch-forward, ping me when it's live" -> "Got it, pulling
    // Jordan in, will ping you"). Gating on the 9:38 beat dropped that decision
    // on the floor: tradeoffChoice stayed null, Raj's 10:05 fallback fired, and
    // the escalation beats announced "PM went quiet, so I made the call": flatly
    // contradicting Raj's own on-record acceptance 50 min earlier.
    //
    // Loosened from raj-diagnosis (9:20) to priya-incidents-escalation (9:15) as
    // the ROOT-CAUSE fix for the confirmed re-explain repro (player settled the
    // patch-forward call with Raj in DM, Raj acknowledged, yet the 9:38
    // #incidents offer re-presented both options and re-asked "which way do you
    // want to go?"). The 9:20 gate had a 5-minute blind window: once the
    // incident is CONFIRMED real (priya-incidents-escalation's "14 tickets, all
    // Apple Pay, CS getting slammed") Raj's persona already holds every fix fact,
    // so a player who jumps straight into Raj's DM and states an explicit call at,
    // say, 9:16 makes a genuine decision, but the 9:20 gate silently refused to
    // classify it, leaving tradeoffChoice null so the 9:38 beat's tradeoffChoice-
    // keyed contentFor cold re-asked. 9:15 is the earliest a rollback-vs-patch
    // call is actually meaningful (the incident isn't confirmed before it, so a
    // "decision" there would be premature), which is the right threshold. The
    // async classifier still returns "unclear" for a mere question, so this only
    // widens WHEN a real, unambiguous call is allowed to register, never what
    // counts as one. (The DISCUSSED-LEDGER variant on the 9:38 beat is the
    // belt-and-suspenders for the residual case where the call is real but the
    // classifier can't extract a definite side.)
    //
    // requestTradeoffEvaluation is still handed the 9:38 offer beat's static
    // `content` as the classifier's reference framing: that scenario text lays
    // out both options and is usable for classification whether or not the beat
    // has fired yet, so an early decision is classified against the same rubric.
    if (
      (channel === "incidents" || channel === "dm_raj") &&
      get().firedEventIds.has("priya-incidents-escalation") &&
      get().stateBag.tradeoffChoice === null
    ) {
      const offerEvent = day1ScenarioEvents.find((e) => e.id === "raj-tradeoff-offer");
      if (offerEvent) {
        const tradeoffResult = await requestTradeoffEvaluation(offerEvent.content, trimmed);
        if (tradeoffResult && tradeoffResult.choice !== "unclear") {
          const choice: "rollback" | "patch-forward" = tradeoffResult.choice;
          const decidedAt = playerMsg.sentAtSimMinutes;
          set((s) => ({
            stateBag: { ...s.stateBag, tradeoffChoice: choice, tradeoffDecidedAtMinutes: decidedAt },
          }));
          if (tradeoffResult.note) {
            set((s) => ({
              evaluations: {
                ...s.evaluations,
                [`${playerMsg.id}-tradeoff`]: {
                  id: makeId("eval"),
                  messageId: playerMsg.id,
                  eventId: "tradeoff-decision",
                  scores: { tone: 0, speed: 0, completeness: 0, strategicThinking: 0 },
                  feedback: tradeoffResult.hasReasoning
                    ? tradeoffResult.note
                    : `${tradeoffResult.note} You picked a side but didn't say what you were trading off to get there. The PM move is naming the tradeoff you're accepting, not only picking.`,
                },
              },
            }));
          }
          const tradeoffTicketId = useTaskflowStore.getState().addTicket(
            choice === "rollback"
              ? "Roll back payment-service to pre-payout-speed state"
              : "Ship retry/idempotency patch for Apple Pay webhook",
            choice === "rollback"
              ? "Revert to before last week's payout-speed update. Fixes the webhook issue fast, sellers lose faster payouts temporarily."
              : "Fix the retry/idempotency handling in place. Slower, but payout speed stays live for sellers.",
            decidedAt,
            "in-progress",
            // advancesTimeOnUpdate: the player's own first move of THIS
            // ticket represents real time spent documenting/tracking the
            // decision they just made (see TicketCard's move handler,
            // which checks this + timeCredited before calling advanceClock).
            { kind: "story", advancesTimeOnUpdate: true, reporterId: "raj" }
          );
          // Captured so the resolution event below can move THIS specific
          // ticket by id (see tradeoffTicketId's own doc comment for why
          // the old "whichever ticket is in-progress" heuristic was wrong).
          // Same set records the commitment ledger for this decision: Raj's
          // decision-acknowledged entry (born settled; a made decision is
          // settled context, not something to re-acknowledge later) and the
          // fix engineers' open "will ping when it lands" commitments. Both
          // appends are idempotent by stable id, so this is safe under the
          // tradeoffChoice === null guard above.
          set((s) => {
            let ledger = s.stateBag.commitmentLedger;
            ledger = recordFixDecisionAck(ledger, {
              choice,
              channel,
              atSimMinutes: decidedAt,
              where: channel === "dm_raj" ? "your DM with Raj" : "#incidents",
              decidedByRaj: false,
            });
            ledger = recordFixEngineerCommitments(ledger, {
              engineerIds: FIX_ENGINEER_AGENT_IDS,
              choice,
              channel,
              atSimMinutes: decidedAt,
            });
            // Seed Raj's all-clear obligation (A2): now that a fix path exists,
            // Raj will post the incident all-clear in #incidents once metrics
            // recover, unless the 11:00 resolution beats him to it (the engine
            // handles that collision). The Raj-fallback path seeds the identical
            // obligation in day1-scenario's derek-tradeoff-escalation; idempotent
            // by stable id. B4's rollback-only obligation (Priya's seller-comms
            // ask) seeds here too, gated on `choice === "rollback"`: the rollback
            // is what pushes ~60 sellers back to the old payout cadence, so only
            // that path creates the downstream seller-facing obligation.
            // Patch-forward seeds only Raj's all-clear, so the seller ask can
            // never fire there. The Raj-fallback path seeds the identical
            // obligation in day1-scenario's derek-tradeoff-escalation; idempotent
            // by stable id.
            let pendingObligations = seedRajAllClear(s.stateBag.pendingObligations, decidedAt);
            if (choice === "rollback") {
              pendingObligations = seedPriyaSellerCommsAsk(pendingObligations, decidedAt);
            }
            return {
              stateBag: { ...s.stateBag, tradeoffTicketId, commitmentLedger: ledger, pendingObligations },
            };
          });
        }
      }
    }

    // Grade the message if this channel is a scored one. The transcript
    // (every channel/DM the player has seen, up to and including this
    // message) is what lets the evaluator check groundedness (whether a
    // claimed fact was actually established yet) instead of grading
    // against a static, spoiler-y description of the "real" situation.
    if (GRADED_CHANNELS.has(channel)) {
      const transcriptSoFar = get().messages.map((m) => ({
        senderId: m.senderId,
        channel: m.channel,
        content: m.content,
        sentAtSimMinutes: m.sentAtSimMinutes,
        // Carry each message's own Pulse reading (present only on player
        // messages sent during the incident) so the evaluator sees the
        // dashboard figure available at the time of every player line, not
        // just the graded one.
        dashboard: m.dashboard,
      }));
      // Which "bucket" this message's score counts toward for scorecard.ts's
      // per-dimension aggregation (e.g. derekEvals). Same root cause as the
      // acknowledgment bug, one layer over: a message answering Derek's ask
      // via #incidents (see alsoSatisfiedByChannels) used to only ever
      // count as an #incidents message, so it never fed stakeholderMgmt.
      // If this message satisfied a request that's natively "at home" in a
      // different channel, credit that channel instead of the literal one
      // it was physically sent in.
      const crossChannelEvent = respondedNow
        .map(({ id }) => day1ScenarioEvents.find((e) => e.id === id))
        .find((e) => e !== undefined && e.channel !== channel);
      const gradingEventId = crossChannelEvent?.channel ?? channel;

      // Behavioral-tone input for the evaluator: deterministic facts about how
      // the player has communicated so far this session (transcriptSoFar
      // already includes this message as its last entry). Tone/framing only,
      // never persisted, never a profile, and the evaluate route is instructed
      // it must not move any score. Kept optional so headless callers that
      // don't compute it still work.
      const observations = deriveSessionObservations({
        transcript: transcriptSoFar,
        respondedAtMinutes: get().stateBag.respondedAtMinutes,
      });

      requestEvaluation(trimmed, channel, transcriptSoFar, observations).then((result) => {
        if (!result) return;
        set((s) => {
          const evaluation: Evaluation = {
            id: makeId("eval"),
            messageId: playerMsg.id,
            eventId: gradingEventId,
            scores: {
              tone: result.tone,
              speed: result.speed,
              completeness: result.completeness,
              strategicThinking: result.strategicThinking,
            },
            feedback: result.feedback,
            // C2: capture the evaluator's per-message claims ledger (grounding
            // statuses + any explicit source attributions). Used at day end for
            // the attribution credibility signal (see analyzeAttributions).
            // Guarded so an old/failed response with no ledger degrades cleanly.
            ...(Array.isArray(result.claims) ? { claims: result.claims } : {}),
          };
          const nextMood: StateBag = { ...s.stateBag };
          const avg =
            (result.tone + result.speed + result.completeness + result.strategicThinking) / 4;
          if (channel === "incidents") {
            nextMood.rajMood = avg >= 7 ? "collaborative" : avg <= 4 ? "frustrated" : "neutral";
          }
          if (channel === "dm_derek") {
            nextMood.derekMood = avg >= 7 ? "engaged" : avg <= 4 ? "impatient" : "neutral";
          }
          return {
            evaluations: { ...s.evaluations, [playerMsg.id]: evaluation },
            stateBag: nextMood,
          };
        });
      });
    }

    // Reactive NPC reply: at most one full answer plus one short redirect.
    // Skipped entirely for the postmortem submission (see above).
    const { primary, secondary } = isPostmortemSubmission
      ? { primary: null, secondary: null }
      : pickReactingAgents(
          channel,
          trimmed,
          pendingChannelEventsAtSendTime,
          // The #general incident redirect stays gated until the incident is
          // on the record (priya-heads-up-dm fired), so a pre-incident hello
          // never triggers it. Other channels ignore this flag.
          get().firedEventIds.has("priya-heads-up-dm")
        );

    if (secondary) {
      const redirectLine = getRedirectLine(channel, secondary);
      // A canned redirect line fires at most once per day per (agent, channel).
      // The key lives in stateBag (plain JSON) so the cap survives persistence
      // round-trips like every other sim flag; after the first fire the agent
      // stays silent rather than repeat the identical line on every message.
      const redirectKey = `${get().day}:${secondary}:${channel}`;
      if (redirectLine && !get().stateBag.redirectsFiredToday.includes(redirectKey)) {
        const redirectMsg: Message = {
          id: makeId("msg"),
          channel,
          senderId: secondary,
          content: redirectLine,
          sentAtSimMinutes: get().clockMinutes,
          createdAt: Date.now(),
        };
        set((s) => {
          const unread = new Set(s.unreadChannels);
          if (channel !== s.activeChannel) unread.add(channel);
          return {
            messages: [...s.messages, redirectMsg],
            unreadChannels: unread,
            stateBag: {
              ...s.stateBag,
              redirectsFiredToday: [...s.stateBag.redirectsFiredToday, redirectKey],
            },
          };
        });
      }
    }

    if (primary) {
      // Capture state (which may carry a fresh lateResponseTo flag) before
      // clearing it: the flag should color exactly this one reply.
      const stateForReply = get().stateBag;
      if (stateForReply.lateResponseTo?.[primary]) {
        set((s) => ({
          stateBag: { ...s.stateBag, lateResponseTo: { ...s.stateBag.lateResponseTo, [primary]: false } },
        }));
      }

      set({ pendingReplyFrom: primary, pendingReplyChannel: channel });
      const history = get()
        .messages.filter((m) => m.channel === channel)
        .slice(-12);

      // Cross-channel #incidents grounding. A reply is otherwise scoped to
      // just its own channel's history, but any persona who is actually
      // present in the #incidents war room carries what they've seen there
      // into a reply they give elsewhere (a DM, or any non-incidents
      // channel). That real transcript is what lets their own live reply
      // push back on / ask the source of a specific claim that isn't backed
      // up, instead of accepting and relaying it (see groundingContextLine
      // in prompts.ts). Presence is roster-driven (CHANNEL_PRESENCE in
      // roster.ts, presence semantics; deliberately distinct from
      // relevance.ts's routing shortlist), so every #incidents member
      // (Derek, Raj, Priya, Marcus) gets the same grounding and none of them
      // can deny visibility into a channel they're actually in. Was formerly
      // hardcoded to Derek. Capped at the last 20 messages to bound token
      // cost now that the transcript reaches more NPC calls (this also caps
      // Derek, who previously got the full unbounded history).
      const groundingOpts =
        channel !== "incidents" && presentInChannel("incidents").includes(primary)
          ? {
              groundingChannelLabel: "#incidents",
              groundingTranscript: get()
                .messages.filter((m) => m.channel === "incidents")
                .slice(-20)
                .map((m) => ({ senderId: m.senderId, content: m.content })),
            }
          : {};

      // When the replier is one of the registry DM engineers, inject their
      // live fix status (path, decision time, ETA math, Pulse reading,
      // resolution) built from the same established state everything else
      // reads: this is the only way today's specifics reach their otherwise
      // fact-free persona. Generic over the registry, no per-name branch.
      const dmContact = DM_CONTACTS.find((c) => c.agentId === primary);
      const personaContextOpt = dmContact
        ? {
            personaContext: buildDmPersonaContext(dmContact, {
              stateBag: stateForReply,
              firedEventIds: get().firedEventIds,
              clockMinutes: get().clockMinutes,
            }),
          }
        : {};

      const replyText = await requestAgentReply(primary, history, stateForReply, {
        easterEggDiscovered: newlyDiscoveredEggs.length > 0,
        clockMinutes: get().clockMinutes,
        channelRoster: presentInChannel(channel),
        ...groundingOpts,
        ...personaContextOpt,
      });
      set({ pendingReplyFrom: null, pendingReplyChannel: null });

      if (replyText) {
        const replyMsg: Message = {
          id: makeId("msg"),
          channel,
          senderId: primary,
          content: replyText,
          sentAtSimMinutes: get().clockMinutes + 2,
          createdAt: Date.now(),
        };
        set((s) => {
          const unread = new Set(s.unreadChannels);
          if (channel !== s.activeChannel) unread.add(channel);
          return { messages: [...s.messages, replyMsg], unreadChannels: unread };
        });

        // Optional agent-to-agent reaction, gated in two stages (see
        // src/lib/sim/crossFunctionalGate.ts). Runs AFTER the primary
        // reply is already rendered (never blocks it) and is capped at
        // exactly one triggered reaction per player message by construction
        // (there is only ever one gate call here, not a recursive chain).
        const stageASkip = stageAShouldSkip({
          channel,
          content: trimmed,
          pendingResponseCount: pendingResponseCountAtSendTime,
          secondaryAgentId: secondary,
        });

        if (stageASkip) {
          useCostStore.getState().recordGateSkip("stage A: routine message, no cross-functional signal");
        } else {
          const gateResult = await requestCrossFunctionalGate(trimmed, primary, replyText);
          const secondAgent = gateResult?.secondAgent ?? null;
          if (gateResult?.crossFunctional && isValidSecondAgent(secondAgent, channel, primary)) {
            set({ pendingReplyFrom: secondAgent, pendingReplyChannel: channel });
            const historyWithReaction = get()
              .messages.filter((m) => m.channel === channel)
              .slice(-12);
            const reactionText = await requestAgentReply(secondAgent, historyWithReaction, get().stateBag, {
              reactingTo: primary,
              callType: "reaction-reply",
              clockMinutes: get().clockMinutes,
              channelRoster: presentInChannel(channel),
            });
            set({ pendingReplyFrom: null, pendingReplyChannel: null });

            if (reactionText) {
              const reactionMsg: Message = {
                id: makeId("msg"),
                channel,
                senderId: secondAgent,
                content: reactionText,
                sentAtSimMinutes: get().clockMinutes + 3,
                createdAt: Date.now(),
              };
              set((s) => {
                const unread = new Set(s.unreadChannels);
                if (channel !== s.activeChannel) unread.add(channel);
                return { messages: [...s.messages, reactionMsg], unreadChannels: unread };
              });
            }
          }
        }
      }
    }

    // Sending a message costs a few simulated minutes, which can bring the
    // next scripted beat into range.
    get().advanceClock(3);

    // Reuses isPostmortemSubmission (snapshotted above, before any of this
    // function's awaits) rather than re-deriving "did the prompt fire" from
    // live state here. Re-deriving it live was a real bug: several awaits
    // (CS-template/tradeoff evaluation calls, NPC reply generation) sit
    // between that snapshot and here, and the clock can advance out from
    // under this call in the meantime (another message sent, or the player
    // clicking +15m). This let an ordinary message get retroactively
    // misattributed as the postmortem once the prompt crossed its trigger
    // while this call was still in flight, ending the day on the wrong text.
    if (isPostmortemSubmission && !get().stateBag.postmortemSubmitted) {
      set((s) => ({
        stateBag: { ...s.stateBag, postmortemSubmitted: true },
        dayComplete: true,
      }));
      get().recordDayScorecard(get().day, trimmed);
    }
  },

  logHelpQuery: (question, topicTag) => {
    const askedAtSimMinutes = get().clockMinutes;
    const entry: HelpQuery = { id: makeId("help"), question, topicTag, askedAtSimMinutes };
    set((s) => ({ helpQueries: [...s.helpQueries, entry] }));
    logHelpQueryToSupabase({ sessionId: get().sessionId, question, topicTag, askedAtSimMinutes });
  },

  sendAskClaudeMessage: async (content) => {
    const trimmed = content.trim();
    if (!trimmed || get().askClaudePending) return;

    const playerMsg: AskClaudeMessage = { id: makeId("help"), senderId: "player", content: trimmed };
    const nextHistory = [...get().askClaudeMessages, playerMsg];
    set({ askClaudeMessages: nextHistory, askClaudePending: true });

    const result = await requestHelp(nextHistory);
    set({ askClaudePending: false });

    if (result) {
      set((s) => ({
        askClaudeMessages: [...s.askClaudeMessages, { id: makeId("help"), senderId: "assistant", content: result.answer }],
      }));
      get().logHelpQuery(trimmed, result.topicTag);
    }
  },

  recordDayScorecard: (day, postmortemText) => {
    const { evaluations, stateBag, helpQueries, clockMinutes, messages, easterEggsFound, firedEventIds } = get();
    const tickets = useTaskflowStore.getState().tickets;
    const { scores, overall, coachingNotes, noEngagement } = computeScorecard(
      evaluations,
      stateBag,
      messages,
      clockMinutes,
      tickets
    );
    // A clean, structured, generic record of what actually happened today
    // (see DayOutcome's doc comment in types.ts). Built here (the one call
    // site for both the postmortem-submission ending and the forced
    // end-of-day boundary) so it can never miss an ending path. Nothing
    // reads or reacts to this yet; it's for tests/logging only.
    const outcome = buildDayOutcome({
      day,
      stateBag,
      firedEventIds,
      clockMinutes,
      messages: messages.map((m) => ({ senderId: m.senderId, channel: m.channel })),
      tickets: tickets.map((t) => ({ id: t.id, assigneeId: t.assigneeId })),
      scores,
      overall,
    });
    // Areas to study are drawn from what the player actually did (coaching
    // notes on graded messages) and asked (Ask Claude questions). With a
    // zero-engagement day AND no questions asked, there is genuinely nothing
    // to derive from, so do not call the study-areas model on the synthetic
    // end-of-day presence note, which would otherwise coax generic links out
    // of it. If they asked questions, those alone are enough to run it.
    const nothingToStudy = noEngagement && helpQueries.length === 0;
    const needsStudyLookup = !nothingToStudy && (helpQueries.length > 0 || coachingNotes.length > 0);

    // C2 deterministic study-topic injection (see injectAttributionStudyTopic).
    // Re-derive the same attribution findings computeScorecard used (read-only:
    // this re-run consumes findings, it never re-scores or re-penalizes). If any
    // is unverified, the Cat-4 topic must surface in Areas to Study no matter
    // what the LLM matcher returns, AND even when the study-areas call is skipped
    // entirely: an unverified attribution IS a signal. So when the lookup is
    // skipped we seed studyAreas synchronously with the injected topic (empty
    // otherwise, preserving the "nothing to study" empty state); when the lookup
    // runs, the injection is applied to the model's picks in its .then below.
    const attributionFindings = analyzeAttributions(evaluations, messages);
    const seededStudyAreas = needsStudyLookup
      ? []
      : buildStudyAreas(injectAttributionStudyTopic([], attributionFindings), []);

    // C1: a zero-engagement day has nothing to explain or quote, so it skips
    // the five-category summarizer entirely and keeps its single presence note
    // (shown via the coachingNotes fallback in ScorecardDetail). Every other
    // day gets the five per-category explanations.
    const shouldExplain = !noEngagement;

    const record: DayScorecardRecord = {
      day,
      scenarioLabel: SCENARIO_LABELS[day] ?? `Day ${day}`,
      completedAtSimMinutes: clockMinutes,
      overall,
      scores,
      coachingNotes,
      postmortemText,
      // Lets the scorecard UI show an honest "nothing to draw from" line for a
      // zero-engagement day instead of the cheerful "nice work staying
      // oriented" empty state (which would be a lie here).
      noEngagement: nothingToStudy,
      studyAreas: seededStudyAreas,
      studyAreasLoading: needsStudyLookup,
      crossFunctionalLoading: true,
      // Filled in async once the summarizer resolves (fired after the
      // coordination score lands, below, so crossFunctional is already final).
      explanationsLoading: shouldExplain,
      // Snapshot only: never fed into scores/overall above, this section
      // exists purely so Reviews/the end-of-day popup can show it, entirely
      // separate from computeScorecard's math.
      easterEggsFound: easterEggsFound.filter((d) => d.day === day),
      outcome,
    };
    set((s) => ({ dayRecords: [...s.dayRecords, record] }));

    // Persist the outcome as soon as it exists: see outcomeStore.ts (the
    // layer that actually works today, localStorage) and persist.ts's
    // logDayOutcomeToSupabase (best-effort mirror, no-op unless Supabase
    // is configured). Called again below once the coordination score
    // updates outcome.scores/overall, so the persisted copy stays in sync.
    saveDayOutcome(get().sessionId, outcome);
    logDayOutcomeToSupabase(get().sessionId, outcome);

    // Full transcript (not just the player's own lines): the evaluator
    // needs context (what was asked, who by) to judge coordination quality.
    const fullTranscript = messages.map((m) => ({
      senderId: m.senderId,
      channel: m.channel,
      content: m.content,
      sentAtSimMinutes: m.sentAtSimMinutes,
    }));
    fetchCoordinationScore(fullTranscript).then(({ score, note }) => {
      // Captured out of the (synchronous) set updater so the chained
      // score-explanation call below sees the FINAL five scores, not the
      // placeholder crossFunctional of 5.
      let finalScores: ScorecardScores = scores;
      set((s) => ({
        dayRecords: s.dayRecords.map((r) => {
          if (r.day !== day) return r;
          if (score === null) {
            finalScores = r.scores;
            return { ...r, crossFunctionalLoading: false };
          }
          const merged = mergeCoordinationScore(r.scores, score);
          finalScores = merged.scores;
          // Keep outcome.scores/overall in lockstep with the record's own:
          // outcome is a snapshot of the SAME scores, not an independent copy
          // that's allowed to go stale once the async coordination score lands.
          const outcome = r.outcome ? { ...r.outcome, scores: merged.scores, overall: merged.overall } : r.outcome;
          if (outcome) {
            saveDayOutcome(get().sessionId, outcome);
            logDayOutcomeToSupabase(get().sessionId, outcome);
          }
          return { ...r, scores: merged.scores, overall: merged.overall, crossFunctionalLoading: false, outcome };
        }),
      }));

      // C1: with crossFunctional now final, explain all five scores in one
      // whole-transcript call. Chained here (rather than fired in parallel)
      // purely so the crossFunctional explanation describes the real number.
      // The grader notes (per-message + synthetic coaching signal) are folded
      // in so their substance isn't lost when the flat notes dump is removed
      // from the UI; the coordination note rides along as a crossFunctional
      // signal. Patches the same race-tolerant way as the merges above:
      // spreads the latest record and only sets its own two fields, so it
      // never clobbers the coordination/study-area/follow-up patches.
      if (!shouldExplain) return;
      const graderNotes = coachingNotes.map((c) => ({ label: c.label, feedback: c.feedback }));
      if (note) graderNotes.push({ label: "Cross-functional coordination", feedback: note });
      fetchScoreExplanations(fullTranscript, finalScores, graderNotes).then((explanations) => {
        set((s) => ({
          dayRecords: s.dayRecords.map((r) =>
            r.day === day
              ? { ...r, categoryExplanations: explanations ?? [], explanationsLoading: false }
              : r
          ),
        }));
      });
    });

    if (needsStudyLookup) {
      fetchStudyAreaMatches(
        helpQueries,
        coachingNotes.map((c) => c.feedback)
      ).then(({ matchedTopicKeys, additionalTopics }) => {
        // C2 injection at the seam where the LLM's picks meet buildStudyAreas:
        // guarantee the Cat-4 topic when an unverified attribution occurred,
        // deduped against whatever the model already returned.
        const studyAreas = buildStudyAreas(
          injectAttributionStudyTopic(matchedTopicKeys, attributionFindings),
          additionalTopics
        );
        set((s) => ({
          dayRecords: s.dayRecords.map((r) => (r.day === day ? { ...r, studyAreas, studyAreasLoading: false } : r)),
        }));
      });
    }
  },

  recordFollowUpTicket: (day, ticketTitle) => {
    set((s) => ({
      dayRecords: s.dayRecords.map((r) => {
        if (r.day !== day) return r;
        const nextScores = { ...r.scores, commClarity: Math.min(10, r.scores.commClarity + 0.5) };
        const nextOverall = Object.values(nextScores).reduce((a, b) => a + b, 0) / Object.values(nextScores).length;
        const note: CoachingEntry = {
          id: makeId("eval"),
          messageId: "follow-up-ticket",
          messageContent: "",
          sentAtSimMinutes: r.completedAtSimMinutes,
          channel: "incidents",
          feedback: `You turned "${ticketTitle}" into a tracked Taskflow ticket instead of letting it stay a line in the postmortem text. That's the actual follow-through a retro is supposed to produce.`,
          label: "Closing the loop",
        };
        return { ...r, scores: nextScores, overall: nextOverall, coachingNotes: [...r.coachingNotes, note] };
      }),
    }));
  },

  setNotesText: (text) => set({ notesText: text }),
  setDifficulty: (difficulty) => set({ difficulty }),
  setPlayerName: (name) => set((s) => ({ stateBag: { ...s.stateBag, playerName: name.trim() } })),
  setPlayerAvatarId: (id) => set((s) => ({ stateBag: { ...s.stateBag, playerAvatarId: id } })),
  recordDocOpened: (docId) =>
    set((s) =>
      s.stateBag.openedDocIds.includes(docId)
        ? {}
        : { stateBag: { ...s.stateBag, openedDocIds: [...s.stateBag.openedDocIds, docId] } }
    ),
  dismissScorecard: () => set({ scorecardDismissed: true }),

  joinStandup: () => {
    // Entering the call IS attending: set standupAttended durably now (not on
    // leave) so the 9:15 #general fallback digest is suppressed even if the
    // player somehow reaches 9:15 with the overlay still open. Idempotent: a
    // second join just re-opens the (already-open) overlay.
    set((s) => ({
      standupCallOpen: true,
      stateBag: { ...s.stateBag, standupAttended: true },
    }));
  },

  leaveStandup: () => {
    // Guard on the overlay actually being open so a stray double-call can't
    // double-post the summary or re-save the doc. Closing the overlay is the
    // first thing we do, so the guard also makes this single-fire.
    if (!get().standupCallOpen) {
      set({ standupCallOpen: false });
      return;
    }
    const sb = get().stateBag;
    const summaryContent = standupDigestContent(sb);
    const doc = buildStandupDoc(sb);
    const at = get().clockMinutes;
    const summaryMsg: Message = {
      id: makeId("evt"),
      channel: "general",
      senderId: "system",
      content: summaryContent,
      sentAtSimMinutes: at,
      createdAt: Date.now(),
      // The saved notes, reachable straight from the summary message, exactly
      // like the non-join fallback digest's own attachment.
      attachment: { label: STANDUP_DOC_FILENAME, docId: STANDUP_DOC_ID },
    };
    set((s) => {
      const unread = new Set(s.unreadChannels);
      if (s.activeChannel !== "general") unread.add("general");
      return {
        standupCallOpen: false,
        messages: [...s.messages, summaryMsg],
        unreadChannels: unread,
        // Upsert by stable id: idempotent with the fallback path's own save.
        stateBag: {
          ...s.stateBag,
          sessionDocs: { ...s.stateBag.sessionDocs, [doc.id]: doc },
        },
      };
    });
  },
}));

export { formatSimTime };
