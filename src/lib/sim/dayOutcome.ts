import type { AgentId, AssigneeId, ChannelId, DayOutcome, ScorecardScores, StateBag } from "./types";
import { getIncidentTimeline, RESOLUTION_ANNOUNCED_AT } from "./incidentTimeline";
import { DM_CONTACTS, dmChannelId } from "./dmContacts";

/** THE single builder for DayOutcome: see the type's own doc comment in
 * types.ts for why this exists (a generic, day-agnostic "what actually
 * happened" record, not Day-1-specific prose). Every producer of a
 * DayScorecardRecord (the real store's recordDayScorecard and
 * scripts/playtest.ts) calls this same function so the shape can never
 * drift between them. Pure: no store/React/fetch, just derives the record
 * from whatever slice of state the caller already has in hand.
 */

/** The narrow slice of live state buildDayOutcome needs. Callers pass
 * whatever they already have: this intentionally isn't "the whole store"
 * (see incidentTimeline.ts's own IncidentTimelineInputs for the same
 * pattern). `tickets` is a minimal shape (just id + assigneeId) since
 * that's all fixTicketAssigneeId needs to look up; a caller with no real
 * Taskflow board (or no assignee tracking at all, e.g. scripts/playtest.ts)
 * can just pass `[]` and get an honest `null` back. */
export interface DayOutcomeInputs {
  day: number;
  stateBag: StateBag;
  firedEventIds: ReadonlySet<string>;
  clockMinutes: number;
  messages: { senderId: AgentId; channel: ChannelId }[];
  tickets: { id: string; assigneeId: AssigneeId | null }[];
  scores: ScorecardScores;
  overall: number;
}

/**
 * Builds a DayOutcome from live sim state at the moment a day ends. Pure:
 * calling this twice with the same inputs always returns the same
 * (deep-equal) result.
 *
 * `endedBy` is derived from stateBag.postmortemSubmitted rather than taken
 * as a parameter: recordDayScorecard is the single call site for both the
 * postmortem-submission ending and the forced-end-of-day boundary, and by
 * the time it runs, postmortemSubmitted truthfully reflects which one just
 * happened (the forced path only ever fires while dayComplete is still
 * false, which requires postmortemSubmitted to still be false too, see
 * simStore.ts's advanceClock).
 */
export function buildDayOutcome(inputs: DayOutcomeInputs): DayOutcome {
  const { day, stateBag, firedEventIds, clockMinutes, messages, tickets, scores, overall } = inputs;

  const timeline = getIncidentTimeline({ stateBag, firedEventIds, clockMinutes });

  let decidedBy: "player" | "raj-fallback" | "auto-resolve" | null = null;
  if (timeline.fixPath !== null) {
    if (stateBag.tradeoffEscalatedToDerek) {
      decidedBy = "raj-fallback";
    } else if (timeline.decidedAt === RESOLUTION_ANNOUNCED_AT) {
      decidedBy = "auto-resolve";
    } else {
      decidedBy = "player";
    }
  }

  const marcusConsultedAtMinutes = stateBag.marcusConsultedAtMinutes;
  const marcusConsultedBeforeDecision =
    marcusConsultedAtMinutes !== null &&
    stateBag.tradeoffDecidedAtMinutes !== null &&
    marcusConsultedAtMinutes <= stateBag.tradeoffDecidedAtMinutes;

  const fixTicketAssigneeId = stateBag.tradeoffTicketId
    ? (tickets.find((t) => t.id === stateBag.tradeoffTicketId)?.assigneeId ?? null)
    : null;

  const dmContactsUsed = DM_CONTACTS.filter((c) =>
    messages.some((m) => m.senderId === "player" && m.channel === dmChannelId(c.id))
  ).map((c) => c.id);

  return {
    day,
    schemaVersion: 1,
    completedAtSimMinutes: clockMinutes,
    endedBy: stateBag.postmortemSubmitted ? "postmortem" : "forced-end-of-day",
    incident: {
      declaredAtMinutes: timeline.incidentDeclaredAt,
      fixPath: timeline.fixPath,
      decidedBy,
      decidedAtMinutes: timeline.decidedAt,
      rajFallbackReasoning: decidedBy === "raj-fallback" ? (stateBag.rajFallbackDecision?.reasoning ?? null) : null,
      fixLandedAtMinutes: timeline.landedAt,
      fullyRecoveredAtMinutes: timeline.fullyRecoveredAt,
      resolutionAnnouncedAtMinutes: timeline.resolutionAnnouncedAt,
    },
    diligence: {
      marcusConsultedAtMinutes,
      marcusConsultedBeforeDecision,
      payoutInconsistencySurfaced: stateBag.payoutInconsistencySurfaced,
    },
    responses: {
      respondedAtMinutes: { ...stateBag.respondedAtMinutes },
      firstIncidentAckAtMinutes: stateBag.respondedAtMinutes["priya-incidents-escalation"] ?? null,
      derekAckAtMinutes: stateBag.respondedAtMinutes["derek-escalation"] ?? null,
    },
    deliverables: {
      postmortemSubmitted: stateBag.postmortemSubmitted,
      csTemplateProvided: stateBag.csTemplateProvided,
      fixTicketAssigneeId,
    },
    contacts: { dmContactsUsed },
    scores,
    overall,
  };
}
