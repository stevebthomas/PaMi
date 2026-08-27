import type { CoachingEntry, Evaluation, Message, ScorecardScores, StateBag, StudyAreaEntry, Ticket } from "./types";
import { PAYMENTS_DOMAIN_ASSIGNEES, rosterName } from "./types";
import { STUDY_RESOURCES } from "../../data/study-resources";
import { INCIDENT_DECLARED_AT } from "./incidentTimeline";
import { day1ScenarioEvents } from "../../data/day1-scenario";

// Day 1-specific: which event's acknowledgment feeds responseTime/stakeholderMgmt,
// and the timing thresholds those scores are judged against. A future story with
// its own event ids/timeline would need its own version of these three lines —
// see scenario-audit-day1.md's Step 3 notes on moving this into story data.
const INCIDENT_EVENT_ID = "priya-incidents-escalation";
const DEREK_EVENT_ID = "derek-escalation";
// Both derived from the single source of truth (incidentTimeline.ts /
// day1-scenario.ts) rather than hardcoded, so they can't silently drift from
// the scripted events they're meant to describe.
const INCIDENT_TRIGGER_MINUTES = INCIDENT_DECLARED_AT; // priya-incidents-escalation fires at 9:15 AM
const RAJ_NUDGE_EVENT = day1ScenarioEvents.find((e) => e.id === "raj-nudge");
if (!RAJ_NUDGE_EVENT) {
  throw new Error("scorecard.ts: expected a 'raj-nudge' event in day1ScenarioEvents to derive INCIDENT_DEADLINE_MINUTES from");
}
const INCIDENT_DEADLINE_MINUTES = RAJ_NUDGE_EVENT.triggerTimeMinutes; // raj-nudge at 9:45 AM marks a slow response

function scoreResponseTime(ackAt: number | null): number {
  if (ackAt === null) return 1;
  const delta = ackAt - INCIDENT_TRIGGER_MINUTES;
  if (delta <= 5) return 10;
  if (delta <= 15) return 8;
  if (delta <= INCIDENT_DEADLINE_MINUTES - INCIDENT_TRIGGER_MINUTES) return 6;
  return 3;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Same Day 1 scoring formula as before — just extracted into one place so
 * both the end-of-day popup and the Reviews app compute it identically.
 * `messages` is used only to attribute each coaching note back to the
 * specific player message it graded. */
export function computeScorecard(
  evaluations: Record<string, Evaluation>,
  stateBag: StateBag,
  messages: Message[],
  /** Sim-clock minute the day actually ended at — normally the postmortem
   * submission's own timestamp, but for a forced end-of-day with no
   * postmortem, the hard end-of-day boundary. Used only to timestamp the
   * synthetic "no postmortem" coaching note below so it sorts last. */
  completedAtSimMinutes: number,
  /** Taskflow's board state at day-end — optional (defaults to none) so
   * callers with no real board (e.g. scripts/playtest.ts's headless local
   * simulation, which never drives the real taskflowStore) don't need to
   * fake one; the assignment_quality signal below just contributes nothing
   * when it's empty. */
  tickets: Ticket[] = []
): { scores: ScorecardScores; overall: number; coachingNotes: CoachingEntry[]; noEngagement: boolean } {
  const evalList = Object.values(evaluations);
  const incidentEvals = evalList.filter((e) => e.eventId === "incidents");
  const derekEvals = evalList.filter((e) => e.eventId === "dm_derek");
  // Real, 4-dimension graded-message evaluations only — excludes side-channel
  // entries that reuse this same Evaluation record shape just to surface a
  // coaching note (e.g. eventId "cs-template", "tradeoff-decision"), which
  // don't carry meaningful tone/completeness scores and would otherwise
  // silently skew commClarity's average. "design-review" IS included here on
  // purpose (unlike those side-channel ids): it's a real, if low-stakes,
  // channel with a full 4-dimension grade, just under EVALUATOR_PROMPT's
  // #design-review special case that scores tone/speed on handling and
  // holds completeness/strategicThinking at a flat satisfied-by-default
  // value — so only its tone feeding commClarity here is meaningful;
  // triageQuality/stakeholderMgmt below don't read it at all.
  const scoredEvals = evalList.filter(
    (e) => e.eventId === "incidents" || e.eventId === "dm_derek" || e.eventId === "design-review"
  );

  // "No real engagement": the player never actually participated today,
  // zero player-authored Chattr messages AND zero graded evaluations. (The
  // second clause is implied by the first, since evaluations only ever come
  // from a player message, but we check both so the intent is explicit and
  // robust to future side-channel evals.) When this holds, the day produced
  // nothing to coach on technique and nothing for the study-areas model to
  // draw from, so we swap the technique-flavored notes for a single honest
  // "presence, not technique" note below and let the caller (store) skip the
  // study-areas call entirely. Ask Claude questions live outside this
  // function (helpQueries), so the store layers those in before deciding
  // whether there is genuinely nothing to study.
  const playerMessageCount = messages.filter((m) => m.senderId === "player").length;
  const noEngagement = playerMessageCount === 0 && evalList.length === 0;

  // A day that ends with no postmortem ever submitted is a real, notable
  // outcome, not a neutral "missing data point" — the retro never happened.
  // Penalize the two dimensions that outcome actually reflects (closing
  // communication, and keeping Derek/leadership in the loop through to the
  // end) rather than silently leaving them as if nothing was wrong.
  const noPostmortemPenalty = stateBag.postmortemSubmitted ? 0 : 3;

  // Raj asked for the rollback-vs-patch-forward call at 9:38 and never got
  // one, so Derek stepped in and made it himself (see day1-scenario.ts's
  // derek-tradeoff-escalation). That's a stakeholder-management miss, not a
  // triage or communication-clarity one, so it only touches that dimension —
  // same additive-penalty pattern as noPostmortemPenalty above.
  const tradeoffEscalationPenalty = stateBag.tradeoffEscalatedToDerek ? 2 : 0;

  const responseTime = scoreResponseTime(stateBag.respondedAtMinutes[INCIDENT_EVENT_ID] ?? null);

  // Task Assignment (realism-features.md) — folds into triageQuality rather
  // than a standalone scorecard dimension, since "did you assign the right
  // ticket to the right person, promptly" is fundamentally a triage
  // judgment, not a new axis of communication/stakeholder skill. Stays
  // path-flexible: no single "correct" assignee, just domain-match/cost-of-
  // inaction patterns surfaced as coaching notes (and a small score nudge
  // only for the clear anti-pattern — sitting unassigned all day).
  const criticalTicket = stateBag.tradeoffTicketId ? tickets.find((t) => t.id === stateBag.tradeoffTicketId) : undefined;
  const assignmentNotes: CoachingEntry[] = [];
  let assignmentDelta = 0;
  if (criticalTicket) {
    if (!criticalTicket.assigneeId) {
      assignmentDelta -= 1.5;
      assignmentNotes.push({
        id: "assignment-unassigned",
        messageId: "assignment-quality",
        messageContent: "",
        sentAtSimMinutes: completedAtSimMinutes,
        channel: "incidents",
        feedback:
          "The payment-fix ticket sat unassigned all day. Even once the incident itself is resolved, an unowned ticket for the actual fix is a real gap: nobody's on the hook for it if it needs follow-up. Leaving a critical ticket unassigned is itself a decision, even when it's not an intentional one.",
        label: "Assignment quality",
      });
    } else if (!PAYMENTS_DOMAIN_ASSIGNEES.has(criticalTicket.assigneeId)) {
      assignmentNotes.push({
        id: "assignment-domain-mismatch",
        messageId: "assignment-quality",
        messageContent: "",
        sentAtSimMinutes: criticalTicket.assignedAtSimMinutes ?? completedAtSimMinutes,
        channel: "incidents",
        feedback: `You assigned the payment-fix ticket to ${rosterName(
          criticalTicket.assigneeId
        )}, not one of the two engineers actually in that payment-adjacent code (Jordan and Chen). Worth checking who's actually positioned to own a fix before assigning it, not just who's convenient or responsive.`,
        label: "Assignment quality",
      });
    } else {
      assignmentNotes.push({
        id: "assignment-domain-match",
        messageId: "assignment-quality",
        messageContent: "",
        sentAtSimMinutes: criticalTicket.assignedAtSimMinutes ?? completedAtSimMinutes,
        channel: "incidents",
        feedback: `You assigned the payment-fix ticket to ${rosterName(
          criticalTicket.assigneeId
        )}, one of the two engineers actually in that code. Good domain match.`,
        label: "Assignment quality",
      });
    }
  }
  const assignedTickets = tickets.filter((t) => t.assigneeId);
  if (assignedTickets.length >= 2) {
    const uniqueAssignees = new Set(assignedTickets.map((t) => t.assigneeId));
    if (uniqueAssignees.size === 1) {
      assignmentNotes.push({
        id: "assignment-concentration",
        messageId: "assignment-quality",
        messageContent: "",
        sentAtSimMinutes: completedAtSimMinutes,
        channel: "incidents",
        feedback: `Every ticket today went to ${rosterName(
          assignedTickets[0].assigneeId!
        )}. Worth checking whether that's genuinely who should own each one, or just the most convenient/responsive person. Piling everything on one engineer is a real workload signal.`,
        label: "Assignment quality",
      });
    }
  }

  // Diligence (Part 6): did the player foresee the rollback's downstream
  // payout cost by consulting Marcus, the one engineer on that pipeline all
  // day and one DM away? Folds into triageQuality (foresight/triage judgment,
  // same dimension the assignment signals feed), capped at a small +/-1. Never
  // penalizes a patch-forward path (payouts untouched there) or the choice
  // itself, only whether a foreseeable cost was investigated when it mattered.
  const marcusConsulted = stateBag.marcusConsultedAtMinutes !== null;
  const marcusConsultedInTime =
    marcusConsulted &&
    stateBag.tradeoffDecidedAtMinutes !== null &&
    (stateBag.marcusConsultedAtMinutes as number) <= stateBag.tradeoffDecidedAtMinutes;
  const rollbackPath = stateBag.tradeoffChoice === "rollback";
  let marcusDelta = 0;
  let marcusNote: CoachingEntry | null = null;
  if (marcusConsultedInTime) {
    marcusDelta += 1;
    marcusNote = {
      id: "marcus-diligence-credit",
      messageId: "marcus-diligence",
      messageContent: "",
      sentAtSimMinutes: stateBag.marcusConsultedAtMinutes as number,
      channel: "dm_marcus",
      feedback:
        "Nice diligence. You checked with Marcus on the payout side before the fix call, so the rollback's downstream cost (the double-payout edge case on the mid-cycle batch) was on your radar in time to do something about it, not a surprise after the fact. Chasing down who owns the thing your decision touches is exactly the move.",
      label: "Diligence",
    };
  } else if (rollbackPath) {
    // Rollback shipped but Marcus wasn't consulted in time to act on it, so the
    // payout inconsistency was foreseeable and hit anyway. Small -1, and the
    // text adapts to whether they never asked or asked too late.
    marcusDelta -= 1;
    marcusNote = {
      id: "marcus-diligence-miss",
      messageId: "marcus-diligence",
      messageContent: "",
      sentAtSimMinutes: stateBag.tradeoffDecidedAtMinutes ?? completedAtSimMinutes,
      channel: "incidents",
      feedback: marcusConsulted
        ? "You did reach Marcus about payouts, but only after the rollback call was already made, too late for him to pause and reconcile the fast-track batch first. The duplicate-payout hit on the multi-bank-account sellers was foreseeable: Marcus was on that pipeline all day, one DM away. Getting to him before the decision, not after, is what would have caught it."
        : "The rollback caused a payout inconsistency (duplicate entries for multi-bank-account sellers mid-cycle) that was foreseeable and preventable. Marcus was hardening that exact pipeline all day and was one DM away the whole time. A rollback reverts more than the buyer-side webhook, and checking with the engineer who owns the affected system before committing is how you catch a cross-system cost like this.",
      label: "Diligence",
    };
  } else if (marcusConsulted) {
    // Patch-forward (payouts untouched, so no consequence) but the player still
    // did the diligence of asking Marcus. Credit the habit; no penalty either
    // way on this path.
    marcusDelta += 1;
    marcusNote = {
      id: "marcus-diligence-credit",
      messageId: "marcus-diligence",
      messageContent: "",
      sentAtSimMinutes: stateBag.marcusConsultedAtMinutes as number,
      channel: "dm_marcus",
      feedback:
        "Good instinct checking with Marcus on the payout side. The patch-forward path left payouts untouched so it didn't end up mattering here, but pulling the thread on who owns the systems a decision could touch is the right habit regardless of how the call goes.",
      label: "Diligence",
    };
  }

  const triageQuality = Math.max(
    0,
    (average(incidentEvals.map((e) => e.scores.completeness)) || 2) + assignmentDelta + marcusDelta
  );
  const commClarity = Math.max(0, (average(scoredEvals.map((e) => e.scores.tone)) || 2) - noPostmortemPenalty);
  const stakeholderMgmt = Math.max(
    0,
    (average(derekEvals.flatMap((e) => [e.scores.tone, e.scores.completeness])) ||
      (DEREK_EVENT_ID in stateBag.respondedAtMinutes ? 4 : 1)) - noPostmortemPenalty - tradeoffEscalationPenalty
  );

  // crossFunctional is deliberately a placeholder here — it's judged by a
  // dedicated whole-transcript evaluator call (see evaluate-coordination),
  // not this synchronous heuristic. Callers fill it in once that resolves.
  const scores: ScorecardScores = {
    responseTime,
    triageQuality: Math.min(10, triageQuality),
    commClarity: Math.min(10, commClarity),
    stakeholderMgmt: Math.min(10, stakeholderMgmt),
    crossFunctional: 5,
  };
  const overall = average(Object.values(scores));

  // Side-channel evaluations reuse the Evaluation shape purely to surface a
  // coaching note, but they grade a specific *decision* the player made
  // inside an ordinary channel message — not the message's general
  // communication quality, which the generic per-channel evaluator above
  // already grades separately. Giving them their own header (instead of
  // reusing "Your message in #channel at TIME") keeps them from reading as
  // a duplicate of that generic note when both fire on the same message.
  const SIDE_CHANNEL_LABELS: Record<string, string> = {
    "cs-template": "Your CS template draft",
    "tradeoff-decision": "Your tradeoff decision",
  };

  const coachingNotes: CoachingEntry[] = evalList
    .filter((e) => e.feedback)
    .map((e) => {
      const message = messages.find((m) => m.id === e.messageId);
      return {
        id: e.id,
        messageId: e.messageId,
        messageContent: message?.content ?? "",
        sentAtSimMinutes: message?.sentAtSimMinutes ?? 0,
        channel: message?.channel ?? "incidents",
        feedback: e.feedback,
        label: SIDE_CHANNEL_LABELS[e.eventId],
      };
    })
    .sort((a, b) => a.sentAtSimMinutes - b.sentAtSimMinutes);

  coachingNotes.push(...assignmentNotes);

  if (!stateBag.postmortemSubmitted) {
    coachingNotes.push({
      id: "no-postmortem",
      messageId: "no-postmortem",
      messageContent: "",
      sentAtSimMinutes: completedAtSimMinutes,
      channel: "incidents",
      feedback:
        "The day ended and no postmortem was ever submitted. The incident got resolved technically, but the retro never happened. That's a real gap, not a missing data point: closing the loop with a written postmortem is part of the job, and it's why communication clarity and stakeholder management scored lower here.",
    });
  }

  if (stateBag.tradeoffEscalatedToDerek) {
    coachingNotes.push({
      id: "tradeoff-escalated",
      messageId: "tradeoff-escalated",
      messageContent: "",
      sentAtSimMinutes: stateBag.tradeoffDecidedAtMinutes ?? completedAtSimMinutes,
      channel: "dm_derek",
      feedback:
        "Raj asked for a call on the rollback-vs-patch-forward fix at 9:38 and got nothing back. By 10:20 he'd looped in Derek, who made the rollback decision for you since you weren't reachable. That's a stakeholder-management miss, not a technical one: the fix still shipped, but the call that was yours to make landed on your VP's desk instead.",
      label: "Stakeholder management",
    });
  }

  if (marcusNote) {
    coachingNotes.push(marcusNote);
  }

  // Path-aware fix-decision note (Part 5): informational, one note that names
  // (a) which fix path the day landed on and (b) whether the player made that
  // call or it defaulted to Raj. Deliberately does NOT penalize the choice
  // (both paths were defensible; handling is graded, not the pick) and adds no
  // scoring dimension. The ownership miss, if any, is already penalized by the
  // separate tradeoff-escalated note above, so this stays framing/reasoning
  // only and just points there rather than re-penalizing. Only fires once a
  // path actually exists (a decision was made, defaulted, or auto-resolved).
  if (stateBag.tradeoffChoice !== null) {
    const isRollback = stateBag.tradeoffChoice === "rollback";
    const pathLabel = isRollback ? "roll back" : "patch forward";
    const pathTradeoff = isRollback
      ? "the fast, known-good fix, at the cost of reverting last week's faster seller payouts"
      : "keeping seller payout speed live, at the cost of a slower fix Raj couldn't promise would fully cover the failure on the first ship";
    const playerMadeCall = !stateBag.tradeoffEscalatedToDerek && stateBag.tradeoffTicketId !== null;
    let pathFeedback: string;
    if (playerMadeCall) {
      pathFeedback = `The day landed on the ${pathLabel} path, and you made that call. Good, it was yours to own. Both options were defensible, so the quality is in the reasoning, not the pick: you went with ${pathTradeoff}. What separates a strong PM here is naming that tradeoff out loud and following it downstream, not just choosing.`;
    } else if (stateBag.tradeoffEscalatedToDerek) {
      pathFeedback = `The day landed on the ${pathLabel} path (${pathTradeoff}), but Raj made that call after you went quiet, not you. The choice itself was fine, that's not the issue. The issue is a decision that was yours ended up made for you, which is covered separately above. Worth internalizing what the ${pathLabel} path actually committed the team to, since owning that reasoning is the part that was missed.`;
    } else {
      pathFeedback = `The day landed on the ${pathLabel} path (${pathTradeoff}), but by default rather than a deliberate call, the incident auto-resolved without an explicit decision from you. The outcome was fine, but letting the path get decided by the clock instead of by you means the reasoning behind it was never actually made. Making the call, and saying why, is the PM move even when the default would have been okay.`;
    }
    coachingNotes.push({
      id: "tradeoff-path",
      messageId: "tradeoff-path",
      messageContent: "",
      sentAtSimMinutes: stateBag.tradeoffDecidedAtMinutes ?? completedAtSimMinutes,
      channel: "incidents",
      feedback: pathFeedback,
      label: "Fix path",
    });
  }

  // Zero-engagement override: deliberately a clean, separate block that runs
  // last and does not touch the assignment / no-postmortem note logic above.
  // When the player never participated, every note assembled above either
  // presupposes engagement (technique feedback on messages that don't exist)
  // or, in the no-postmortem note's case, would double up on the same "you
  // didn't close anything out" point the presence note makes better. So we
  // replace the whole set with one honest note. The score penalties stay as
  // computed (the no-postmortem -3 math is untouched); only the redundant
  // note text is dropped.
  if (noEngagement) {
    const presenceNote: CoachingEntry = {
      id: "no-engagement",
      messageId: "no-engagement",
      messageContent: "",
      sentAtSimMinutes: completedAtSimMinutes,
      channel: "incidents",
      feedback:
        "The day ran and ended without you sending a single message or responding to anything, including the postmortem. There's nothing to coach on technique here, because technique isn't the gap: presence is. A live incident needs you in the room and saying something before any of the finer PM skills (grounding a claim, naming a tradeoff, closing the loop) even come into play. Start by showing up and responding, and the rest becomes coachable.",
    };
    // The payout inconsistency (Part 6) is a concrete WORLD consequence, not a
    // technique critique, so it survives the no-engagement override: if a
    // rollback ran (via Raj's fallback) and hit the foreseeable payout dupe, the
    // player still deserves to see that it happened and why. The credit variant
    // can't occur here (it requires a Marcus DM, which is itself engagement), so
    // only the miss note ever reaches this branch. The path/technique notes are
    // deliberately still dropped, the presence note supersedes those.
    const notes = marcusNote ? [presenceNote, marcusNote] : [presenceNote];
    return { scores, overall, coachingNotes: notes, noEngagement };
  }

  return { scores, overall, coachingNotes, noEngagement };
}

/** Merges a resolved coordination judgment score into an existing scores
 * object and recomputes the overall average. */
export function mergeCoordinationScore(
  scores: ScorecardScores,
  crossFunctional: number
): { scores: ScorecardScores; overall: number } {
  const next: ScorecardScores = { ...scores, crossFunctional: Math.max(0, Math.min(10, crossFunctional)) };
  return { scores: next, overall: average(Object.values(next)) };
}

/** Turns AI-returned topic keys/labels into the actual curated bullets —
 * real descriptions and links come from our own data, never from the model.
 * Shared by the app's store and the standalone playtest script. */
export function buildStudyAreas(matchedTopicKeys: string[], additionalTopics: string[]): StudyAreaEntry[] {
  const resourceMap = new Map(STUDY_RESOURCES.map((r) => [r.topicKey, r]));
  const matched: StudyAreaEntry[] = matchedTopicKeys
    .map((key) => resourceMap.get(key))
    .filter((entry): entry is (typeof STUDY_RESOURCES)[number] => Boolean(entry))
    .map((entry) => ({
      topicKey: entry.topicKey,
      topicLabel: entry.topicLabel,
      reason: entry.shortDescription,
      resources: entry.resources,
    }));
  const additional: StudyAreaEntry[] = additionalTopics.map((label) => ({
    topicKey: null,
    topicLabel: label,
    reason: null,
    resources: [],
  }));
  return [...matched, ...additional];
}
