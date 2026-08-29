export type AgentId =
  | "raj"
  | "priya"
  | "derek"
  | "sam"
  | "maya"
  | "theo"
  // Jordan and Chen are the two engineers pulled onto the incident fix. They
  // start as Office-only sprites but become DM-capable the moment they're on
  // the fix (see DM_CONTACTS in dmContacts.ts), so they're real AgentIds with
  // their own reply persona, unlike Marcus/Ines who stay decorative.
  | "jordan"
  | "chen"
  // Marcus is a real engineer at his desk all day, hardening the seller
  // payout pipeline. Unlike Ines/Theo he IS DM-capable (his card is clickable
  // all day, see DM_CONTACTS) with his own reply persona, because the payout
  // consequence of a rollback is discoverable by DMing him. So he's a real
  // AgentId, not decorative.
  | "marcus"
  | "system"
  | "player";

/** Everyone a Taskflow ticket can actually be assigned to — a mix of the
 * chat-capable AgentIds (minus sam/system/player, who aren't realistic
 * ticket owners) and the four Office engineers (Jordan, Chen, Marcus, Ines).
 * Jordan and Chen are now DM-capable AgentIds too (see DmContactId below);
 * Marcus and Ines have no AgentId/prompt of their own but are still real,
 * named people the player can hand work to. */
export type AssigneeId = "raj" | "priya" | "derek" | "maya" | "theo" | "jordan" | "chen" | "marcus" | "ines";

/** Who filed a ticket — either an NPC whose message/action generated it, or
 * the player themself (freeform tickets, and the postmortem follow-up). */
export type ReporterId = AssigneeId | "player";

export interface RosterMember {
  id: AssigneeId;
  name: string;
  title: string;
}

/** Assignment-target roster shown in Taskflow's assignee picker — see
 * TaskflowApp.tsx. Titles mirror AGENT_TITLES/OfficeApp's ENGINEERS below. */
export const ASSIGNABLE_TEAM: RosterMember[] = [
  { id: "raj", name: "Raj", title: "Engineering Manager" },
  { id: "priya", name: "Priya", title: "Operations & Support Lead" },
  { id: "derek", name: "Derek", title: "VP of Product" },
  { id: "maya", name: "Maya", title: "Backend Engineer" },
  { id: "theo", name: "Theo", title: "Junior Engineer" },
  { id: "jordan", name: "Jordan", title: "Engineer" },
  { id: "chen", name: "Chen", title: "Engineer" },
  { id: "marcus", name: "Marcus", title: "Engineer" },
  { id: "ines", name: "Ines", title: "Engineer" },
];

/** The two engineers already in payment-adjacent checkout code (see
 * OfficeApp's INCIDENT_ENGINEER_NAMES) — the domain-correct assignees for
 * the payments-incident fix ticket, used by the assignment_quality signal
 * in scorecard.ts. */
export const PAYMENTS_DOMAIN_ASSIGNEES = new Set<AssigneeId>(["jordan", "chen"]);

export function rosterName(id: AssigneeId): string {
  return ASSIGNABLE_TEAM.find((m) => m.id === id)?.name ?? id;
}

export function reporterLabel(id: ReporterId | null | undefined): string | null {
  if (!id) return null;
  if (id === "player") return "You";
  return rosterName(id);
}

/** DM-capable characters that live in a registry (DM_CONTACTS in
 * dmContacts.ts) and appear in Chattr only when their availability predicate
 * is true, rather than as static CHANNELS entries. Their DM channel id is
 * always `dm_${DmContactId}`, so ChannelId scales to any future registry
 * contact without a hand-maintained union. Kept here (not in dmContacts.ts)
 * so ChannelId can reference it without a circular import. */
export type DmContactId = "jordan" | "chen" | "marcus";

export type ChannelId =
  | "general"
  | "incidents"
  | "design-review"
  | "random"
  | "dm_raj"
  | "dm_priya"
  | "dm_derek"
  // Registry DM channels — one per DM_CONTACTS entry, e.g. "dm_jordan".
  | `dm_${DmContactId}`;

export interface Message {
  id: string;
  channel: ChannelId;
  senderId: AgentId;
  content: string;
  sentAtSimMinutes: number;
  createdAt: number;
  /** For a player message during an active incident, the Pulse dashboard
   * reading as it stood at sentAtSimMinutes (checkout success rate + failed
   * Apple Pay checkouts since incident start), captured at send time so the
   * evaluator can treat a figure the player actually read off Pulse as a
   * grounded, system-supplied fact. Optional: absent on NPC/system messages,
   * on player messages sent before the incident starts, and on any older
   * persisted message from before this field existed. */
  dashboard?: string;
}

export interface EvaluationScores {
  tone: number;
  speed: number;
  completeness: number;
  strategicThinking: number;
}

export interface Evaluation {
  id: string;
  messageId: string;
  eventId: string;
  scores: EvaluationScores;
  feedback: string;
}

/** One question asked to the "Ask Claude" glossary helper, for the
 * end-of-day "Areas to study" scorecard section. */
export interface HelpQuery {
  id: string;
  question: string;
  topicTag: string | null;
  askedAtSimMinutes: number;
}

/** One turn in the Ask Claude conversation. Lives in the sim store (not
 * component state) so closing/reopening the Ask Claude window doesn't
 * lose the conversation. */
export interface AskClaudeMessage {
  id: string;
  senderId: "assistant" | "player";
  content: string;
}

/** The five scored dimensions shown on a day's scorecard. */
export interface ScorecardScores {
  responseTime: number;
  triageQuality: number;
  commClarity: number;
  stakeholderMgmt: number;
  crossFunctional: number;
}

/** One coaching note, tied to the specific player message it's about —
 * not a loose paragraph of general advice. */
export interface CoachingEntry {
  /** Unique per note — the underlying Evaluation's own id. Needed because
   * several evaluations (e.g. the generic per-channel grade and a
   * side-channel one like "tradeoff-decision") can share the same
   * messageId, which would otherwise collide as a React list key. */
  id: string;
  messageId: string;
  messageContent: string;
  sentAtSimMinutes: number;
  channel: ChannelId;
  feedback: string;
  /** Overrides the default "Your message in #channel at TIME" header —
   * used by side-channel evaluations (cs-template, tradeoff-decision) so
   * they don't read as a duplicate of the generic per-message note that
   * often fires on the very same message. */
  label?: string;
}

/** One "areas to study" bullet. `topicKey`/`resources` are populated only
 * when the topic matched a curated entry in study_resources — otherwise
 * it's a plain, link-less bullet (see src/data/study-resources.ts). */
export interface StudyAreaEntry {
  topicKey: string | null;
  topicLabel: string;
  reason: string | null;
  resources: { title: string; url: string; source: string }[];
}

export type TicketStatus = "todo" | "in-progress" | "done";

/** "story" tickets are seeded by the scripted narrative (the early
 * investigation ticket, the tradeoff-decision fix ticket, the postmortem
 * follow-up ticket) — these get a visually distinct card (see TaskflowApp)
 * so it's clear at a glance why some tickets are tied to a real story beat
 * and others ("freeform" — anything typed into the + ADD form) aren't. */
export type TicketKind = "story" | "freeform";

/** A Taskflow board card. Lives here (not taskflowStore.ts) like every other
 * shared shape, since scorecard.ts's assignment-quality signal needs the
 * same type without taskflowStore.ts depending on lib/sim/scorecard.ts. */
export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  createdAtSimMinutes: number;
  kind: TicketKind;
  /** Marks this specific ticket as one whose first player-driven move
   * should advance the sim clock — see TicketCard in TaskflowApp.tsx, which
   * reads this (and `timeCredited` below) before calling advanceClock. */
  advancesTimeOnUpdate?: boolean;
  /** Set once this ticket's time-advance has already been credited — the
   * anti-gaming guard against toggling the same ticket back and forth. */
  timeCredited?: boolean;
  /** Who filed this ticket — auto-set at creation from whichever
   * persona's message/action generated it, or "player" for anything
   * self-filed (freeform tickets, the postmortem follow-up). Null only for
   * tickets created before this field existed. */
  reporterId: ReporterId | null;
  /** Who's doing it. Null until the player assigns it — see
   * taskflowStore's assignTicket. */
  assigneeId: AssigneeId | null;
  /** Sim-clock minute the ticket was last (re)assigned — feeds the
   * assignment_quality signal's "cost of inaction" / time-to-assign read. */
  assignedAtSimMinutes?: number;
}

/** One logged "easter egg" discovery — see ScenarioEvent.easterEgg. Entirely
 * separate from Evaluation/ScorecardScores: never carries a score, never
 * feeds computeScorecard, purely a delight/collectible record. */
export interface EasterEggDiscovery {
  /** The ScenarioEvent id this discovery came from. */
  id: string;
  day: number;
  discoveredAtSimMinutes: number;
  label: string;
}

/** A completed day's scorecard, computed once when that day wraps up and
 * kept around so it can be reviewed later (the "Reviews" app) as well as
 * shown in the end-of-day popup — both read this same record. */
export interface DayScorecardRecord {
  day: number;
  scenarioLabel: string;
  completedAtSimMinutes: number;
  overall: number;
  scores: ScorecardScores;
  coachingNotes: CoachingEntry[];
  postmortemText: string | null;
  studyAreas: StudyAreaEntry[];
  /** true while the AI topic-matching call is in flight. */
  studyAreasLoading: boolean;
  /** true when the player never engaged today (no messages, no questions) so
   * there was nothing to derive study areas from. Optional; when set, the
   * scorecard shows an honest "nothing to draw from" line instead of the
   * cheerful empty state. Not every producer sets it. */
  noEngagement?: boolean;
  /** true while the whole-transcript coordination judgment is in flight —
   * scores.crossFunctional is a placeholder (5) until this resolves. */
  crossFunctionalLoading: boolean;
  /** Purely-for-fun discoveries logged on this day — see EasterEggDiscovery.
   * Optional (not every producer of a DayScorecardRecord-shaped object needs
   * to populate this, e.g. scripts/playtest.ts doesn't track it) and always
   * rendered in its own visually-separate section, never folded into
   * `scores`/`overall`. */
  easterEggsFound?: EasterEggDiscovery[];
  /** A clean, structured, generic record of what actually happened this day
   * — see DayOutcome. Optional so older producers of a DayScorecardRecord-
   * shaped object (or any future one that skips it) still compile. Nothing
   * reads or reacts to this yet (no Day 2 exists); it exists purely as
   * structured data for logging/tests, built once by buildDayOutcome (see
   * dayOutcome.ts) at the same moment the rest of this record is computed. */
  outcome?: DayOutcome;
}

/** A clean, structured, generic record of what actually happened on a given
 * day — deliberately free of narrative prose (other than the one verbatim
 * quote, rajFallbackReasoning) so a future day can reuse the exact same
 * shape and builder (see buildDayOutcome in dayOutcome.ts) instead of this
 * being Day-1-specific. Nothing in the app reads or reacts to this yet (no
 * Day 2 exists to consume it) — it exists purely as structured data for
 * tests/logging. `schemaVersion` is bumped only if this shape changes in a
 * way that breaks an existing consumer. */
export interface DayOutcome {
  day: number;
  schemaVersion: 1;
  completedAtSimMinutes: number;
  endedBy: "postmortem" | "forced-end-of-day";
  incident: {
    declaredAtMinutes: number | null;
    fixPath: "rollback" | "patch-forward" | null;
    /** "player" if the player made the rollback-vs-patch-forward call
     * themselves before the 11:00 auto-resolve, "raj-fallback" if Raj made
     * the call after the player went quiet (tradeoffEscalatedToDerek),
     * "auto-resolve" if nobody ever decided and the 11:00 default picked
     * patch-forward, null if no fix path exists at all (shouldn't happen
     * once the day has ended, since the incident always auto-resolves). */
    decidedBy: "player" | "raj-fallback" | "auto-resolve" | null;
    decidedAtMinutes: number | null;
    /** Raj's own first-person reasoning for his fallback call — see
     * RajFallbackDecision. Null unless decidedBy is "raj-fallback". The
     * one narrative string on this whole record, kept because it's a direct
     * quote of something an NPC actually said, not summary prose. */
    rajFallbackReasoning: string | null;
    fixLandedAtMinutes: number | null;
    fullyRecoveredAtMinutes: number | null;
    resolutionAnnouncedAtMinutes: number | null;
  };
  diligence: {
    marcusConsultedAtMinutes: number | null;
    /** True iff Marcus was consulted at or before the fix decision, i.e. in
     * time to actually act on his warning — same "in time" rule scorecard.ts
     * and day1-scenario.ts's consultedMarcusInTime already use. */
    marcusConsultedBeforeDecision: boolean;
    payoutInconsistencySurfaced: boolean;
  };
  responses: {
    /** Copy of stateBag.respondedAtMinutes — event id -> the sim-clock
     * minute the player satisfied that event's requiresResponse ask. */
    respondedAtMinutes: Record<string, number>;
    firstIncidentAckAtMinutes: number | null;
    derekAckAtMinutes: number | null;
  };
  deliverables: {
    postmortemSubmitted: boolean;
    csTemplateProvided: boolean;
    fixTicketAssigneeId: AssigneeId | null;
    // followUpTicketCreated intentionally omitted: no existing flag
    // represents "the postmortem follow-up ticket was created" (see
    // recordFollowUpTicket in simStore.ts, which just patches an already-
    // recorded scorecard's score/coaching notes, not a boolean on StateBag
    // or the Taskflow ticket itself) — see dayOutcome.ts's builder comment.
  };
  /** Registry DM contacts (see DM_CONTACTS in dmContacts.ts) the player
   * DMed at least once today, in registry order. */
  contacts: { dmContactsUsed: DmContactId[] };
  scores: ScorecardScores;
  overall: number;
}

/** One decision point during a playtest run — the persona's stated internal
 * reasoning before its in-character action, whether or not it acted.
 * Diagnostic data for us, not shown to a real player. */
export interface PlaytestReasoningEntry {
  event: string;
  reasoning: string;
  action: string;
  simTime: string;
}

/** A scorecard produced by `npm run playtest` (scripts/playtest.ts) — an AI
 * persona playing Day 1 blind. Same shape as a real player's scorecard,
 * plus the persona label, its free-form meta-commentary on the simulation
 * itself, and its decision-by-decision reasoning log. Read from
 * src/app/api/playtests, not the sim store. */
export interface PlaytestRecord extends DayScorecardRecord {
  kind: "run";
  persona: string;
  playtesterLabel: string;
  playtesterNotes: string;
  reasoningLog: PlaytestReasoningEntry[];
  runIndex: number;
  runsTotal: number;
}

/** Average scores across a persona's N runs — same score shape as a single
 * run, no per-message detail (coaching notes/postmortem/study areas don't
 * average meaningfully, so those are left empty; look at the individual
 * runs for that). */
export interface PlaytestAggregateRecord {
  kind: "aggregate";
  persona: string;
  playtesterLabel: string;
  day: number;
  scenarioLabel: string;
  overall: number;
  scores: ScorecardScores;
  runsTotal: number;
}

/** One synthesized "here's where a real player might need ambient help"
 * finding, pulled across all of the novice persona's runs. */
export interface GuidanceOpportunity {
  moment: string;
  whatHappened: string;
  suggestedGuidance: string;
}

/** A scripted beat in the scenario timeline. Fires once when sim time
 * reaches triggerTimeMinutes, unless `condition` says to skip it. */
export interface ScenarioEvent {
  id: string;
  day: number;
  triggerTimeMinutes: number;
  eventType: "chattr_message" | "notification" | "postmortem_prompt";
  agentId: AgentId;
  channel: ChannelId;
  content: string;
  /** Optional state-dependent override for `content`. When present, the store
   * renders THIS (called with the live state bag at fire time) instead of the
   * static `content` string — used by beats whose text must reflect a runtime
   * decision (e.g. Derek relaying Raj's actual fallback reasoning, which isn't
   * known until a model call resolves). `content` stays as the deterministic
   * fallback for any consumer that doesn't call contentFor (e.g. the headless
   * playtest mirror), so it must always read as a sensible standalone line. */
  contentFor?: (state: StateBag) => string;
  requiresResponse?: boolean;
  responseDeadlineMinutes?: number;
  /** If set, a reply in THIS event's channel also counts as answering the
   * named earlier event's requiresResponse ask — e.g. a DM chase-up that
   * re-raises a question originally asked in a shared channel. Lets a
   * chase-up "count" without hardcoding which channels are equivalent. */
  reAsks?: string;
  /** Additional channels (beyond this event's own `channel`) where a reply
   * also counts as answering this specific request — for an ask whose own
   * content plausibly invites a reply somewhere else (e.g. a DM that says
   * "saw the thread in #x", inviting a reply in #x instead). */
  alsoSatisfiedByChannels?: ChannelId[];
  /** Only fire this event if the current state bag matches. Absent = always fire. */
  condition?: (state: StateBag) => boolean;
  /** Applied to the state bag the moment this event fires. */
  applyEffect?: (state: StateBag) => Partial<StateBag>;
  /** Hand-curated, plain-fact bullets this message conveys (not tasks, not
   * "you should" phrasing) — powers the easy-difficulty fact checklist.
   * Absent for events that are asks/demands/system framing rather than
   * new information (e.g. a chase-up DM), which the checklist skips. */
  facts?: string[];
  /** Marks this event as an optional, purely-for-fun discovery — reusable
   * across any future ambient beat, any day. If the player replies in this
   * event's own channel any time after it fires, the discovery gets logged
   * (see StateBag-adjacent easterEggsFound in simStore) and the NPC's reply
   * gets a warmer, more delighted tone for that one message. `label` is the
   * short, player-facing description shown wherever discoveries are listed.
   * Deliberately NOT wired into requiresResponse/scoring in any way — see
   * the boundary comment at the discovery-tracking call site. */
  easterEgg?: { label: string };
}

/** Difficulty tier for player-facing ambient-help features (not for scoring
 * or NPC behavior). "easy" is the only tier defined so far; a future tier
 * can simply omit a given feature's UI rather than needing new engine code. */
export type Difficulty = "easy" | "standard";

/** Raj's reasoned fallback decision on the rollback-vs-patch-forward tradeoff,
 * produced by a model call (see /api/agents/raj-fallback-decision) when the
 * player has gone quiet and Raj has to make the call himself before Derek's
 * 10:20 escalation. This is Raj genuinely weighing the SAME established
 * tradeoff, so the choice and its reasoning vary run to run instead of being
 * the identical hardcoded "rollback" every disengaged playthrough. Null until
 * the call resolves (or a scripted API-failure fallback fills it in). */
export interface RajFallbackDecision {
  choice: "rollback" | "patch-forward";
  /** Raj's first-person, 2-3 sentence Slack-voice reasoning for the choice —
   * what Derek relays to the player and what Raj's own #incidents follow-up
   * is consistent with. */
  reasoning: string;
  /** The 1-2 sentence line Raj sends Derek when he loops him in on the call
   * he made — Raj's own voice, reused for his #incidents announcement. */
  derekLine: string;
  /** Sim-clock minute the decision actually landed (when the model call
   * resolved), which is also when the escalation gets delivered. Truthful to
   * when Raj made the call, so Pulse's recovery curve keys off the right time
   * even if the call resolved after the 10:20 trigger was crossed. */
  decidedAtMinutes: number;
}

/** What kind of thing a commitment-ledger entry records. Kept as a small
 * closed set of string literals (not free text) so A1 can populate and A2 can
 * branch on it deterministically, and so it survives JSON round-tripping. */
export type CommitmentKind =
  /** The NPC committed to doing something themselves (e.g. Raj: "rollback's in
   * as of 10:30, watching the error rate now"). */
  | "npc-commitment"
  /** A decision the NPC has acknowledged / is now operating under (e.g. Priya
   * acknowledging the rollback path was chosen). Not the NPC's own promise —
   * their awareness of a call that was made. */
  | "decision-acknowledged"
  /** Something the PLAYER owes this NPC (e.g. Priya waiting on a CS draft, Derek
   * waiting on a blast-radius number). The obligation is on the player; this
   * entry is the NPC-side memory of it. */
  | "player-owes-npc";

/**
 * One entry in the per-NPC commitment ledger (see StateBag.commitmentLedger).
 * Deliberately a flat, self-describing record (each entry names its own NPC via
 * `agentId`) rather than a Map keyed by NPC, so it stays plain-JSON and A1 can
 * append without touching a nested structure. It is DISTINCT from message
 * history: history is what was literally said; this is the extracted,
 * structured "who committed/owes what" that A2 reasons over.
 *
 * All fields are primitives, so the whole array is JSON-serializable for the
 * persistence layer landing in a later subtask.
 */
export interface CommitmentEntry {
  /** Stable unique id (e.g. makeId("commit")). */
  id: string;
  /** Which NPC this commitment concerns / is held by. */
  agentId: AgentId;
  /** Short human-readable description of what was committed, decided, or owed. */
  summary: string;
  /** Where it was made / recorded. */
  channel: ChannelId;
  /** Sim-clock minute it was made / recorded. */
  atSimMinutes: number;
  /** See CommitmentKind. */
  kind: CommitmentKind;
  /** Whether it's still outstanding ("open") or has been met/closed ("settled"). */
  status: "open" | "settled";
}

/** A deliverable the player might owe (referenced by a "player-delivered"
 * obligation trigger). Closed set so triggers stay declarative data A2 can
 * switch on rather than free text. */
export type ObligationDeliverable = "cs-template" | "postmortem" | "incident-recap" | "fix-decision";

/** A named point in the incident's lifecycle an obligation can key off (for the
 * "incident-state-reached" trigger). These mirror milestones the incident
 * timeline already tracks (see incidentTimeline.ts) so A2 can map each to a
 * real predicate without new bookkeeping. */
export type IncidentStateDescriptor =
  | "declared"
  | "fix-decided"
  | "fix-landed"
  | "metrics-recovered"
  | "resolution-announced";

/**
 * The condition under which a pending obligation should fire — a DECLARATIVE
 * DATA DESCRIPTOR, never a function/closure, so the whole obligation survives
 * JSON round-tripping for persistence. A2 owns the evaluation logic that turns
 * one of these descriptors into an actual boolean against live state; this type
 * only DESCRIBES the condition. Variants are chosen to cover the Day-1
 * obligations A2 will need: Raj's all-clear once the fix lands and metrics
 * recover, Priya nudging about an undelivered draft, and obligations that react
 * to incident-state changes.
 */
export type ObligationTrigger =
  /** Fire once the incident fix has actually landed (e.g. Raj's all-clear). */
  | { type: "fix-landed" }
  /** Fire once checkout metrics have recovered to baseline. */
  | { type: "metrics-recovered" }
  /** Fire once the player has (or has NOT, per A2's reading) delivered a
   * specific artifact — e.g. Priya nudging about an undelivered CS draft. */
  | { type: "player-delivered"; deliverable: ObligationDeliverable }
  /** Fire once `minutes` sim-minutes have elapsed since `sinceSimMinutes` —
   * e.g. a nudge that only lands after a stretch of silence. */
  | { type: "sim-minutes-elapsed-since"; sinceSimMinutes: number; minutes: number }
  /** Fire when the incident reaches a named lifecycle state. */
  | { type: "incident-state-reached"; state: IncidentStateDescriptor };

/**
 * Which seeded obligation this is — the discriminator the A2 engine uses to
 * pick the deterministic copy builder for the NPC message it fires (see
 * buildObligationMessageContent in dmContacts.ts). The trigger/cancelWhen
 * descriptors below carry the state condition; this carries the identity and
 * wording. A new obligation (e.g. B4's seller-comms ask on the rollback path)
 * is a new member here + a seed helper + a copy builder + one seed call.
 */
export type ObligationKind =
  /** Raj posts the incident all-clear in #incidents once metrics recover,
   * unless the 11:00 scripted resolution beats him to it. */
  | "raj-all-clear"
  /** Priya nudges once for the customer-facing draft after a stretch of
   * silence, iff it's still not attempted. */
  | "priya-cs-nudge"
  /** Priya follows up once with changed context if the incident resolves while
   * the customer-facing draft is still not attempted. */
  | "priya-cs-resolved-followup";

/**
 * One pending obligation (see StateBag.pendingObligations): a thing an NPC is
 * waiting on or owes, plus the declarative condition that should surface it.
 * A2 builds the state-conditional engine that evaluates `trigger` and acts;
 * this shape is only the data it operates on. Every field is a primitive or a
 * plain descriptor object, so the array is fully JSON-serializable.
 */
export interface ObligationEntry {
  /** Stable unique id (e.g. `oblig-${kind}`) — the append is deduped by this,
   * so a re-entrant advanceClock / re-run applyEffect can't double-seed. */
  id: string;
  /** Which seeded obligation this is — selects the copy builder (see
   * ObligationKind). Lets the engine act on obligations generically while the
   * exact wording lives in one deterministic builder per kind. */
  kind: ObligationKind;
  /** The NPC who holds / is waiting on this obligation. */
  agentId: AgentId;
  /** Short human-readable description of what's owed or awaited. */
  summary: string;
  /** The channel the follow-up would surface in. */
  channel: ChannelId;
  /** Declarative, JSON-serializable condition A2 evaluates — NOT a callback.
   * The obligation FIRES (emits its NPC message) when this becomes true, as
   * long as `cancelWhen` didn't become true first. */
  trigger: ObligationTrigger;
  /** Optional declarative condition that CANCELS this obligation silently (no
   * message) when it becomes true before `trigger` does. The engine compares
   * the sim-minute each condition became true, so whichever happened FIRST wins
   * deterministically, independent of evaluation/processing order. Absent = the
   * obligation can only fire or stay pending, it never self-cancels. */
  cancelWhen?: ObligationTrigger;
  /** Lifecycle: still waiting, fired/handled, or dropped. */
  status: "pending" | "fulfilled" | "cancelled";
  /** Sim-clock minute this obligation was created. */
  createdAtSimMinutes: number;
}

export interface StateBag {
  /** Generic, event-id-keyed acknowledgment tracking: for every
   * requiresResponse event the player has satisfied (by replying in any
   * channel that counts for it — see ScenarioEvent.reAsks /
   * alsoSatisfiedByChannels), the sim-clock minute they did so. This is the
   * one mechanism every story's escalation/scoring logic reads from —
   * no per-story named boolean flags. */
  respondedAtMinutes: Record<string, number>;
  /** "Provided AND judged good" — not just "attempted." See the CS-template
   * evaluator (/api/agents/evaluate-cs-template). */
  csTemplateProvided: boolean;
  /** Sim-clock minute the player first ATTEMPTED a customer-facing draft for
   * Priya — set the moment the CS-template evaluation block runs in
   * sendPlayerMessage, regardless of whether the draft was judged good. Null
   * until then. Distinct from csTemplateProvided ("attempted AND good"): this
   * is "attempted at all," which is what Priya's follow-up obligations settle
   * on, so a delivered-but-mediocre draft never gets a cold "still waiting"
   * nudge. Plain number|null, so it round-trips through persistence untouched. */
  csTemplateAttemptedAtMinutes: number | null;
  rajMood: "neutral" | "collaborative" | "frustrated";
  priyaMood: "neutral" | "reassured" | "overwhelmed";
  derekMood: "neutral" | "engaged" | "impatient";
  samMood: "neutral" | "calm" | "concerned";
  postmortemSubmitted: boolean;
  /** Which fix path the player chose when Raj offered the rollback vs.
   * patch-forward tradeoff — null until decided. Drives Pulse's recovery
   * curve and the seeded Taskflow ticket. */
  tradeoffChoice: "rollback" | "patch-forward" | null;
  /** Sim-clock minute the tradeoff was decided — Pulse's recovery curve is
   * computed relative to this, not to when the incident started. */
  tradeoffDecidedAtMinutes: number | null;
  /** The Taskflow ticket id created for the tradeoff-decision fix — null
   * until decided. Lets the resolution event's auto-move-to-done target
   * this SPECIFIC ticket by id instead of guessing "whichever ticket
   * happens to be in-progress right now," which breaks the moment the
   * player has moved any other ticket (e.g. a freeform one) into
   * in-progress themselves. */
  tradeoffTicketId: string | null;
  /** True once Raj's rollback-vs-patch-forward tradeoff (raj-tradeoff-offer)
   * went unanswered long enough that Derek stepped in and made the call
   * himself (see day1-scenario.ts's derek-tradeoff-escalation). Drives a
   * stakeholder-management coaching note/penalty in scorecard.ts. */
  tradeoffEscalatedToDerek: boolean;
  /** Raj's reasoned fallback call (see RajFallbackDecision) when the player
   * never engaged the tradeoff — null until the model call resolves. Drives
   * Derek's relayed escalation text and Raj's #incidents follow-up, and is
   * injected into Raj's live persona so a later "why'd you pick that?" answer
   * matches what Derek relayed. */
  rajFallbackDecision: RajFallbackDecision | null;
  /** One-shot flag: this agent's next reply should let a late response's
   * delay show in tone. Consumed (cleared) the moment it's used. */
  lateResponseTo: Partial<Record<AgentId, boolean>>;
  /** Registry DM contacts that have already fired their one-time "the fix
   * just landed" follow-up ping (see buildFixLandedFollowUp / advanceClock's
   * follow-up block). Persisted here so the ping fires exactly once per
   * contact and survives re-renders, and so a +15m jump past the real landing
   * minute can't replay it. */
  fixLandedFollowUpsSent: DmContactId[];
  /** Sim-clock minute the player first DMed Marcus with a message that
   * actually touches the payout pipeline / rollback / payouts (a generic
   * "hi" does NOT count — see MARCUS_PAYOUT_KEYWORDS in simStore.ts for the
   * exact deterministic matcher). Null until that happens. This is the
   * "diligence" signal Part 6 keys off: whether the player foresaw the
   * rollback's downstream payout cost by asking the one engineer who was on
   * that pipeline all day. Compared against tradeoffDecidedAtMinutes to tell
   * "consulted in time to act on it" from "consulted too late / never." */
  marcusConsultedAtMinutes: number | null;
  /** True once the rollback-caught-the-batch payout inconsistency beat has
   * actually surfaced (marcus-payout-inconsistency). Only ever set on a
   * rollback path where Marcus wasn't consulted before the decision; stays
   * false on patch-forward and on any rollback where the player consulted
   * Marcus in time. Read by the scorecard's diligence coaching note. */
  payoutInconsistencySurfaced: boolean;
  /** Per-NPC ledger of commitments/decisions extracted from the conversation —
   * distinct from raw message history (see CommitmentEntry). Populated by an
   * upcoming subtask (A1); empty for now. Must stay plain-JSON (a flat array of
   * primitive-valued entries, no Sets/Maps/functions) because a persistence
   * layer lands next and this has to survive JSON round-tripping. */
  commitmentLedger: CommitmentEntry[];
  /** Obligations an NPC is waiting on/owes, each carrying a DECLARATIVE trigger
   * descriptor (see ObligationEntry / ObligationTrigger) rather than a
   * function — the state-conditional engine that evaluates them is a later
   * subtask (A2); this is just the data. Empty for now. Must stay plain-JSON
   * (no Sets/Maps/closures) so it survives JSON round-tripping for persistence. */
  pendingObligations: ObligationEntry[];
  [key: string]: unknown;
}

export const initialStateBag: StateBag = {
  respondedAtMinutes: {},
  csTemplateProvided: false,
  csTemplateAttemptedAtMinutes: null,
  rajMood: "neutral",
  priyaMood: "neutral",
  derekMood: "neutral",
  samMood: "neutral",
  postmortemSubmitted: false,
  tradeoffChoice: null,
  tradeoffDecidedAtMinutes: null,
  tradeoffTicketId: null,
  tradeoffEscalatedToDerek: false,
  rajFallbackDecision: null,
  lateResponseTo: {},
  fixLandedFollowUpsSent: [],
  marcusConsultedAtMinutes: null,
  payoutInconsistencySurfaced: false,
  commitmentLedger: [],
  pendingObligations: [],
};

export const AGENT_NAMES: Record<AgentId, string> = {
  raj: "Raj",
  priya: "Priya",
  derek: "Derek",
  sam: "Sam",
  maya: "Maya",
  theo: "Theo",
  jordan: "Jordan",
  chen: "Chen",
  marcus: "Marcus",
  system: "System",
  player: "You",
};

/** Job titles, used for the Chattr DM header badge and the HR orientation chat. */
export const AGENT_TITLES: Partial<Record<AgentId, string>> = {
  raj: "Engineering Manager",
  priya: "Operations & Support Lead",
  derek: "VP of Product",
  sam: "Head of People",
  maya: "Backend Engineer",
  theo: "Junior Engineer",
  jordan: "Engineer",
  chen: "Engineer",
  marcus: "Engineer",
};

export const CHANNELS: { id: ChannelId; label: string; kind: "channel" | "dm" }[] = [
  { id: "general", label: "#general", kind: "channel" },
  { id: "incidents", label: "#incidents", kind: "channel" },
  { id: "design-review", label: "#design-review", kind: "channel" },
  { id: "random", label: "#random", kind: "channel" },
  { id: "dm_raj", label: "Raj", kind: "dm" },
  { id: "dm_priya", label: "Priya", kind: "dm" },
  { id: "dm_derek", label: "Derek", kind: "dm" },
];
