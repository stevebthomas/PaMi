import type {
  AgentId,
  ChannelId,
  IncidentStateDescriptor,
  ObligationEntry,
  ObligationKind,
  ObligationTrigger,
} from "./types";

/**
 * NPC-INITIATED FOLLOW-UPS (A2): the state-conditional engine behind obligations
 * an NPC is waiting on / has promised. This is the piece that turns the
 * declarative `ObligationTrigger` descriptors seeded onto StateBag.pendingObligations
 * into actual "fire this NPC message now / settle it silently" decisions.
 *
 * THE CENTRAL RULE (see the subtask brief): a follow-up is NEVER fired on a
 * fixed clock regardless of state. Every firing must pass a real state check at
 * fire time. Elapsed SIM time is a legitimate trigger COMPONENT (it's sim
 * state), but a time trigger alone never fires an obligation — it's always
 * paired, via `cancelWhen`, with the state condition that would make the
 * follow-up moot (the player already handled it, the underlying condition never
 * held). There are zero wall-clock timers here; everything keys off the sim
 * clock and derived incident/state facts the caller passes in.
 *
 * DEPENDENCY DISCIPLINE (mirrors commitments.ts): this module imports ONLY from
 * ./types. day1-scenario.ts calls the seed helpers below from a couple of event
 * applyEffects, and day1-scenario sits at the bottom of the
 * worldCanon -> incidentTimeline -> day1-scenario init cycle. Importing anything
 * that reaches incidentTimeline / timeOfDay here (both of which import
 * day1-scenario) would close that cycle. So this file takes the timeline-derived
 * facts it needs as PLAIN PRIMITIVES (ObligationInputs), computed by the caller
 * (simStore, which is free to import incidentTimeline), and the deterministic
 * message copy lives in dmContacts.ts (buildObligationMessageContent), which is
 * not on that cycle. The engine returns firing DESCRIPTORS; the caller renders
 * the copy. That split is what keeps this module a leaf.
 *
 * IDEMPOTENCY / RE-ENTRANCY: seeds dedupe by a stable, kind-derived id, so a
 * re-run applyEffect or a re-entrant advanceClock can't double-seed. Firing
 * flips an obligation's `status` off "pending"; the engine only ever acts on
 * "pending" entries, so a re-entrant advanceClock can't double-fire. All
 * entries stay plain-JSON primitives, so pendingObligations round-trips through
 * the persistence layer untouched.
 */

/** How long after Priya's ask (priya-template-request, 9:26 AM) she nudges once
 * about the still-undelivered customer-facing draft — a "reasonable interval"
 * of silence, not a hard deadline. 45 sim-minutes. Only ever fires alongside
 * the "still not attempted" state check (see the cancelWhen on the seed). */
export const PRIYA_CS_NUDGE_DELAY_MINUTES = 45;

/** Stable, deterministic id for a seeded obligation. Each Day-1 obligation is a
 * singleton (one per day), so keying purely on kind is enough for the append to
 * dedupe by identity across re-entrant advanceClock / re-run applyEffect. */
export function obligationId(kind: ObligationKind): string {
  return `oblig-${kind}`;
}

/** Append an obligation unless one with the same id already exists. Never
 * mutates the input array (returns it unchanged when already present). */
export function appendObligation(list: ObligationEntry[], entry: ObligationEntry): ObligationEntry[] {
  if (list.some((o) => o.id === entry.id)) return list;
  return [...list, entry];
}

// --- Seed helpers: one per Day-1 obligation. Each is a pure, idempotent append
// callable from an event applyEffect (day1-scenario) or a store transition
// (simStore). They take ONLY primitives so this module stays a ./types-only
// leaf. A future obligation (e.g. B4's seller-comms ask on the rollback path)
// is a new ObligationKind + a new seed helper here + a copy builder in
// dmContacts.ts + one seed call at the relevant state transition. ---

/**
 * Raj's incident all-clear in #incidents. He posts it once checkout metrics
 * have fully recovered — the follow-through on "watching the error rate come
 * down now" — UNLESS the 11:00 scripted resolution announcement
 * (resolution-good/resolution-cold) fires first, in which case his personal
 * all-clear is moot and settles silently (the cancelWhen). Seeded the moment a
 * fix path is decided, on BOTH the player-decision path (simStore Feature B)
 * and the Raj-fallback path (day1-scenario's derek-tradeoff-escalation).
 */
export function seedRajAllClear(obligations: ObligationEntry[], decidedAtSimMinutes: number): ObligationEntry[] {
  return appendObligation(obligations, {
    id: obligationId("raj-all-clear"),
    kind: "raj-all-clear",
    agentId: "raj",
    summary:
      "Raj will post the incident all-clear in #incidents once metrics fully recover, unless the 11:00 resolution announcement beats him to it.",
    channel: "incidents",
    trigger: { type: "metrics-recovered" },
    // The collision to design around: if the formal resolution goes out before
    // metrics recover, Raj's own all-clear would read as a redundant duplicate,
    // so cancel it. The engine compares WHEN each condition became true, so a
    // recovery strictly before 11:00 still fires (Raj called it early); a
    // recovery at/after 11:00 cancels (resolution beat him).
    cancelWhen: { type: "incident-state-reached", state: "resolution-announced" },
    status: "pending",
    createdAtSimMinutes: decidedAtSimMinutes,
  });
}

/**
 * Priya's one-time nudge for the customer-facing draft. Fires only if
 * PRIYA_CS_NUDGE_DELAY_MINUTES have passed since she asked AND the player still
 * hasn't ATTEMPTED a draft (the cancelWhen). Attempting at any point — even a
 * mediocre draft — settles this silently, so it never reads as a cold "still
 * waiting" after the player already sent something. Seeded when she asks
 * (priya-template-request).
 */
export function seedPriyaCsNudge(obligations: ObligationEntry[], askedAtSimMinutes: number): ObligationEntry[] {
  return appendObligation(obligations, {
    id: obligationId("priya-cs-nudge"),
    kind: "priya-cs-nudge",
    agentId: "priya",
    summary:
      "Priya will nudge once, lightly, for the customer-facing draft if it's still not attempted ~45 min after she asked.",
    channel: "dm_priya",
    trigger: {
      type: "sim-minutes-elapsed-since",
      sinceSimMinutes: askedAtSimMinutes,
      minutes: PRIYA_CS_NUDGE_DELAY_MINUTES,
    },
    cancelWhen: { type: "player-delivered", deliverable: "cs-template" },
    status: "pending",
    createdAtSimMinutes: askedAtSimMinutes,
  });
}

/**
 * Priya's updated-context follow-up: if the incident resolves while the
 * customer-facing draft is STILL not attempted, she follows up once noting the
 * situation changed (her team has handled it) rather than silently letting the
 * thread die. This is a genuinely NEW state change, distinct from the nudge, so
 * it may still fire once even if the nudge already fired. Attempting the draft
 * at any point settles it silently (the cancelWhen). Seeded alongside the nudge
 * (priya-template-request).
 */
export function seedPriyaCsResolvedFollowUp(obligations: ObligationEntry[], askedAtSimMinutes: number): ObligationEntry[] {
  return appendObligation(obligations, {
    id: obligationId("priya-cs-resolved-followup"),
    kind: "priya-cs-resolved-followup",
    agentId: "priya",
    summary:
      "If the incident resolves with the customer-facing draft still not attempted, Priya follows up once with the changed context.",
    channel: "dm_priya",
    trigger: { type: "incident-state-reached", state: "resolution-announced" },
    cancelWhen: { type: "player-delivered", deliverable: "cs-template" },
    status: "pending",
    createdAtSimMinutes: askedAtSimMinutes,
  });
}

/**
 * The timeline-derived + state-derived facts the trigger evaluator needs, all
 * as plain primitives so this module never imports incidentTimeline (see the
 * dependency note above). The caller (simStore) builds this from
 * getIncidentTimeline + stateBag. Every timestamp that is non-null here is, by
 * construction, already <= the current clock (the timeline only exposes a
 * milestone's minute once it has actually been reached), which is what lets the
 * engine timestamp a fired message at "the minute its condition became true"
 * and never later than the current clock.
 */
export interface ObligationInputs {
  clockMinutes: number;
  /** timeline.landedAt — null until the fix has actually landed. */
  landedAtMinutes: number | null;
  /** timeline.fullyRecoveredAt — the minute checkout metrics return to baseline;
   * null until the fix has landed (and it may be in the future relative to the
   * clock, so the evaluator gates it on clock >= this). */
  fullyRecoveredAtMinutes: number | null;
  /** timeline.incidentDeclaredAt — null until the escalation fired. */
  incidentDeclaredAtMinutes: number | null;
  /** timeline.decidedAt — the minute a fix path was chosen; null until decided. */
  decidedAtMinutes: number | null;
  /** timeline.resolutionAnnouncedAt — null until resolution-good/cold fired. */
  resolutionAnnouncedAtMinutes: number | null;
  /** stateBag.csTemplateAttemptedAtMinutes — the minute the player first
   * attempted the customer-facing draft (good or not); null if never. */
  csTemplateAttemptedAtMinutes: number | null;
}

/** The sim-minute the named incident milestone became true, or null if it has
 * not yet. Kept separate so both `metrics-recovered` and the
 * `incident-state-reached` variant read milestones the same way. */
function incidentStateReachedAt(state: IncidentStateDescriptor, inputs: ObligationInputs): number | null {
  switch (state) {
    case "declared":
      return inputs.incidentDeclaredAtMinutes;
    case "fix-decided":
      return inputs.decidedAtMinutes;
    case "fix-landed":
      return inputs.landedAtMinutes;
    case "metrics-recovered":
      return inputs.fullyRecoveredAtMinutes !== null && inputs.clockMinutes >= inputs.fullyRecoveredAtMinutes
        ? inputs.fullyRecoveredAtMinutes
        : null;
    case "resolution-announced":
      return inputs.resolutionAnnouncedAtMinutes;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/**
 * The sim-minute a trigger's condition became true (always <= clockMinutes), or
 * null if it isn't satisfied yet. Returning the MINUTE rather than a bare
 * boolean is what makes fire-vs-cancel deterministic by sim-time: the engine
 * compares the trigger's and the cancelWhen's satisfied-at minutes and lets the
 * one that happened first win, independent of processing order (e.g. a big +15m
 * clock jump that crosses several milestones in one advanceClock tick).
 */
export function triggerSatisfiedAt(trigger: ObligationTrigger, inputs: ObligationInputs): number | null {
  const { clockMinutes } = inputs;
  switch (trigger.type) {
    case "fix-landed":
      return inputs.landedAtMinutes;
    case "metrics-recovered":
      return inputs.fullyRecoveredAtMinutes !== null && clockMinutes >= inputs.fullyRecoveredAtMinutes
        ? inputs.fullyRecoveredAtMinutes
        : null;
    case "player-delivered":
      // Only cs-template maps to a recorded attempt minute today; other
      // deliverables have no sim-minute stamp yet, so they read as "not
      // delivered" (null) until one is added. Documented, not silently omitted.
      return trigger.deliverable === "cs-template" ? inputs.csTemplateAttemptedAtMinutes : null;
    case "sim-minutes-elapsed-since": {
      const at = trigger.sinceSimMinutes + trigger.minutes;
      return clockMinutes >= at ? at : null;
    }
    case "incident-state-reached":
      return incidentStateReachedAt(trigger.state, inputs);
    default: {
      const _exhaustive: never = trigger;
      return _exhaustive;
    }
  }
}

/** One obligation that fires this tick: enough for the caller to build the NPC
 * message (it renders the copy from `kind` via buildObligationMessageContent).
 * `sentAtSimMinutes` is the minute the condition became true — the message is
 * timestamped there, per the fix-landed follow-up precedent, never later than
 * the current clock. */
export interface ObligationFiring {
  obligationId: string;
  kind: ObligationKind;
  agentId: AgentId;
  channel: ChannelId;
  sentAtSimMinutes: number;
}

export interface ObligationEvalResult {
  /** Obligations that fire now, in chronological order (earliest first) so a
   * single clock jump firing more than one reads naturally in the transcript. */
  firings: ObligationFiring[];
  /** The obligations array with statuses updated (fired -> "fulfilled",
   * settled-silently -> "cancelled"). The SAME array reference when nothing
   * changed, so the caller can cheaply skip the state write. */
  nextObligations: ObligationEntry[];
  changed: boolean;
}

/**
 * Evaluate every pending obligation against live state and decide, for each,
 * whether it fires (emit its NPC message), cancels silently, or keeps waiting.
 *
 * Pure and deterministic: same inputs -> same result. For each pending entry it
 * computes when its fire `trigger` became true and when its `cancelWhen` (if
 * any) became true, then:
 *   - FIRES if the trigger is satisfied and nothing cancelled it first
 *     (cancel unsatisfied, or the trigger became true strictly earlier).
 *   - CANCELS (settles silently, no message) if the cancel condition happened
 *     first / instead.
 *   - otherwise leaves it pending.
 * Only "pending" entries are ever touched, which is the re-entrancy guard: a
 * re-run of this function after a firing sees "fulfilled"/"cancelled" and does
 * nothing.
 */
export function evaluateObligations(obligations: ObligationEntry[], inputs: ObligationInputs): ObligationEvalResult {
  const firings: ObligationFiring[] = [];
  let changed = false;

  const next = obligations.map((o) => {
    if (o.status !== "pending") return o;

    const fireAt = triggerSatisfiedAt(o.trigger, inputs);
    const cancelAt = o.cancelWhen ? triggerSatisfiedAt(o.cancelWhen, inputs) : null;

    // Fire when the trigger is satisfied and the cancel condition didn't beat
    // it (unsatisfied, or the trigger happened strictly earlier). A tie goes to
    // cancel below — e.g. metrics recovering at the exact resolution minute is
    // "not before" the resolution, so the personal all-clear is moot.
    if (fireAt !== null && (cancelAt === null || fireAt < cancelAt)) {
      changed = true;
      firings.push({
        obligationId: o.id,
        kind: o.kind,
        agentId: o.agentId,
        channel: o.channel,
        sentAtSimMinutes: fireAt,
      });
      return { ...o, status: "fulfilled" as const };
    }

    // Cancel silently when the cancel condition happened first (or the trigger
    // is unsatisfied while the cancel is satisfied).
    if (cancelAt !== null && (fireAt === null || cancelAt <= fireAt)) {
      changed = true;
      return { ...o, status: "cancelled" as const };
    }

    return o;
  });

  firings.sort((a, b) => a.sentAtSimMinutes - b.sentAtSimMinutes);

  return { firings, nextObligations: changed ? next : obligations, changed };
}
