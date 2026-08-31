import type { AgentId, ChannelId, DmContactId, ObligationKind, StateBag, Ticket } from "./types";
import { INCIDENT_START_MINUTES, dashboardReadingAt } from "./pulseMetrics";
import { getIncidentTimeline, describeFixStatus, type IncidentTimeline } from "./incidentTimeline";
import { formatSimClock } from "./timeOfDay";
import { PAYOUT_PIPELINE, MARCUS_ROLLBACK_CONCERN } from "./worldCanon";

/**
 * Registry of DM-capable characters who are NOT static CHANNELS entries:
 * they appear in Chattr's DM list (and become clickable in Office) the moment
 * their `availableWhen` predicate turns true, and drop out again when it turns
 * false. This is the single, generic mechanism behind "message the engineer
 * doing the work": ChannelList, the Office cards, and the availability badge
 * all read from this one list, so there is no Jordan/Chen-specific branch
 * anywhere in the UI or the store. Adding a future DM-capable character is a
 * new entry here plus their persona in prompts.ts, nothing else.
 *
 * Day 1 registers three contacts:
 *  - jordan and chen, the two engineers pulled onto the incident fix. Their
 *    availability derives from the SAME source of truth Office uses for their
 *    desk labels (stateBag.tradeoffChoice being non-null), so a card flipping
 *    to "on the fix" and the DM opening up are guaranteed to happen together,
 *    whether the fix path was chosen by the player, by a Derek escalation, or
 *    by the 11:00 auto-resolve.
 *  - marcus, who is NOT on the incident at all. He's at his desk hardening the
 *    seller payout pipeline all day, and he's registered as available ALL DAY
 *    (availableWhen: always true) so a diligent player can DM him and discover
 *    the rollback's downstream payout cost. His persona is "adjacent": he
 *    informs on payouts, he does not touch the fix decision.
 * Ines and Theo remain unregistered: they're genuinely uninvolved and have no
 * dialogue.
 */
export interface DmContact {
  id: DmContactId;
  /** Also the AgentId whose persona replies in this DM. */
  agentId: AgentId;
  name: string;
  title: string;
  /** Which persona-context builder + copy this contact uses:
   *  - "lead"/"support" parameterize the shared incident-fix engineer template
   *    (the lead is heads-down on the fix, support is assisting) and drive the
   *    Office desk-label copy.
   *  - "adjacent" is a contact who isn't on the incident fix at all (Marcus on
   *    the payout pipeline); it selects buildMarcusPersonaContext instead of
   *    the fix-status block. See buildDmPersonaContext. */
  role: "lead" | "support" | "adjacent";
  availableWhen: (ctx: DmAvailabilityContext) => boolean;
}

/** Everything a predicate is allowed to read: deliberately the same generic
 * engine state Office and the store already hold, never a per-story flag. */
export interface DmAvailabilityContext {
  stateBag: StateBag;
  firedEventIds: Set<string>;
  tickets?: Ticket[];
}

/** True once a fix path exists at all: the one source of truth Office's desk
 * labels also key off. Shared so the predicate and any caller that wants the
 * raw condition stay in lockstep. */
function onIncidentFix(ctx: DmAvailabilityContext): boolean {
  return ctx.stateBag.tradeoffChoice !== null;
}

export const DM_CONTACTS: DmContact[] = [
  {
    id: "jordan",
    agentId: "jordan",
    name: "Jordan",
    title: "Engineer",
    role: "lead",
    availableWhen: onIncidentFix,
  },
  {
    id: "chen",
    agentId: "chen",
    name: "Chen",
    title: "Engineer",
    role: "support",
    availableWhen: onIncidentFix,
  },
  {
    // Marcus is available all day: he's a real engineer at his desk on the
    // payout pipeline, not gated on the incident. The `true` predicate is what
    // makes his Office card clickable and his DM present from the start, so the
    // rollback's payout consequence is discoverable through diligence.
    id: "marcus",
    agentId: "marcus",
    name: "Marcus",
    title: "Engineer",
    role: "adjacent",
    availableWhen: () => true,
  },
];

/** The DM channel id for a registry contact: the one place `dm_${id}` is
 * constructed, so the template-literal ChannelId stays honest. */
export function dmChannelId(id: DmContactId): ChannelId {
  return `dm_${id}`;
}

/** Registry contacts currently available, in registry order. */
export function availableDmContacts(ctx: DmAvailabilityContext): DmContact[] {
  return DM_CONTACTS.filter((c) => c.availableWhen(ctx));
}

/** The registry contact a DM channel belongs to, or null if it isn't a
 * registry DM channel (a static dm_raj/dm_priya/dm_derek, or a real channel). */
export function dmContactForChannel(channel: ChannelId): DmContact | null {
  return DM_CONTACTS.find((c) => dmChannelId(c.id) === channel) ?? null;
}

/** Whether an AgentId is one of the registry DM engineers: lets generic
 * lookups (relevance, the store) treat them as a class, not by name. */
export function isDmContactAgent(agentId: AgentId): boolean {
  return DM_CONTACTS.some((c) => c.agentId === agentId);
}

/**
 * The live, grounded context block injected into an engineer's system prompt
 * at request time (passed through the reply route's `personaContext`). This is
 * the ONLY channel through which today's actual state reaches them: the base
 * persona in prompts.ts is static and deliberately fact-free.
 *
 * Every timing fact here comes from ONE source of truth, getIncidentTimeline,
 * not a private duration constant of its own (that private FIX_DURATION_MINUTES
 * copy was the root cause of the "two invented timelines" bugs). The block
 * states, as one explicit fact, exactly one of: no fix decided yet / fix in
 * progress with an expected landing time / fix landed at a specific time, plus
 * whether the 11:00 formal resolution announcement has gone out. The Pulse
 * reading (same dashboardReadingAt the evaluator treats as a system fact) and
 * the scripted incident facts round it out. If no decision exists yet, the
 * block says so, so the engineer truthfully says they're not on it.
 */
export function buildEngineerPersonaContext(contact: DmContact, ctx: DmAvailabilityContext & { clockMinutes: number }): string {
  const { stateBag, firedEventIds, clockMinutes } = ctx;
  const timeline = getIncidentTimeline({ stateBag, firedEventIds, clockMinutes });

  const lines: string[] = [];
  lines.push(
    `\n\nLIVE STATUS (private context, current as of ${formatSimClock(clockMinutes)}. Ground every answer in this and nothing beyond it. When the player asks when anything happened or will happen, quote the exact clock time written below, word for word. Never restate a time as a relative guess of your own like "a couple minutes ago" or "any minute now"; give the timestamp exactly as written, and the relative gap only as it's written here.):`
  );

  if (timeline.fixPath === null || timeline.decidedAt === null) {
    lines.push(
      `- No fix path has been decided yet. You have NOT been pulled onto this yet and haven't started. If asked for status or an ETA, say plainly you're not on it yet and they should check with Raj.`
    );
    return lines.join("\n");
  }

  const isRollback = timeline.fixPath === "rollback";
  lines.push(
    `- The chosen fix path is: ${isRollback ? "ROLL BACK payment-service to before last week's payout-speed update" : "PATCH FORWARD (retry/idempotency handling in place, keeps payout speed)"}.`
  );
  lines.push(
    `- The decision was made at ${formatSimClock(timeline.decidedAt)}. You've been ${contact.role === "lead" ? "leading" : "supporting"} the work since then.`
  );

  if (isRollback) {
    lines.push(
      `- What the rollback is: revert to the old webhook retry logic that demonstrably doesn't hit this Stripe flakiness. It's the known-good, sure fix, about 10 minutes of work. Its cost is that it pulls last week's faster seller payouts, but that's an ops/Priya matter, not yours to speak to.`
    );
  } else {
    lines.push(
      `- What the patch is: fix the retry/idempotency handling on the Apple Pay webhook in place, about 30 minutes. Honest caveat you share if asked: Raj could not reproduce the exact Stripe failure, so you cannot promise the first ship fully covers it. It might hold, it might need a second pass.`
    );
  }

  // When the player went quiet and Raj made the fix call himself (looped Derek
  // in), the engineers were put on the fix by Raj, not by the PM. So they must
  // not credit or thank the PM for a decision the PM never made.
  if (stateBag.tradeoffEscalatedToDerek) {
    lines.push(
      `- Who made this call: the PM went quiet on the fix decision, so Raj made it himself and looped Derek in. This was Raj's call, not the PM's. If it comes up, don't credit or thank the PM for choosing this path.`
    );
  }

  lines.push(
    `- Scripted facts you can state: the Stripe webhook for Apple Pay is returning 500s on ~3% of Apple Pay checkout attempts. Card and Google Pay are unaffected. Nothing shipped to payments in the last 24h; root cause is Stripe-side webhook flakiness.`
  );

  // The ONE timing fact, straight off the shared timeline: never re-derived
  // here. When asked "when did/will it land," the persona quotes this verbatim.
  if (timeline.landedAt !== null) {
    const recoveredLine =
      timeline.fullyRecoveredAt !== null
        ? ` The checkout success rate was fully back to baseline by ${formatSimClock(timeline.fullyRecoveredAt)}.`
        : "";
    lines.push(
      `- FIX STATUS (the single timing fact, quote the timestamp verbatim): the fix ${describeFixStatus(timeline, clockMinutes)}.${recoveredLine}${!isRollback ? " It held; you'd flagged it might need a second pass, but it didn't." : ""} If asked when it went in, give exactly that clock time, never a fresh relative guess.`
    );
  } else if (clockMinutes >= timeline.expectedLandAt!) {
    // Guard only: the current model can't produce "past expected but not
    // landed" (landedAt flips the instant clock reaches expectedLandAt), but
    // if it ever did, say it's running long rather than claiming it's in.
    lines.push(
      `- FIX STATUS: the fix was expected to land around ${formatSimClock(timeline.expectedLandAt!)} but is not confirmed in yet. If asked, say it's running a little long and you're still watching it land, do NOT say it already landed.`
    );
  } else {
    lines.push(
      `- FIX STATUS (the single timing fact, quote the timestamp verbatim): the fix is in progress, ${describeFixStatus(timeline, clockMinutes)}.${!isRollback ? " Still flag it might need a second pass." : ""} If asked for an ETA, give exactly that expected clock time, not a fresh relative guess of your own.`
    );
  }

  // The 11:00 formal resolution announcement is a separate beat from the fix
  // actually landing; state which side of it we're on.
  lines.push(
    timeline.resolutionAnnouncedAt !== null
      ? `- The formal resolution announcement (the all-clear) already went out at ${formatSimClock(timeline.resolutionAnnouncedAt)}. The incident is officially closed.`
      : `- The formal resolution announcement (the all-clear) has NOT gone out yet.`
  );

  const pulse =
    timeline.incidentDeclaredAt !== null
      ? dashboardReadingAt(clockMinutes, {
          incidentStartMinutes: INCIDENT_START_MINUTES,
          tradeoffChoice: timeline.fixPath,
          tradeoffDecidedAtMinutes: timeline.decidedAt,
        })
      : null;
  if (pulse) {
    lines.push(
      `- Current Pulse dashboard reading (quote ONLY as "the dashboard shows...", it's a reading, not something you personally verified): ${pulse}.`
    );
  }

  // Fix 2 permission: before the fix lands, the persona may promise to ping
  // when it's in, because the system actually delivers that ping (see
  // buildFixLandedFollowUp + advanceClock's follow-up block). Nothing else.
  if (timeline.landedAt === null) {
    lines.push(
      `- You MAY promise to ping the player as soon as the fix lands. That's a real promise: the system delivers that ping for you automatically the moment it's in. Do not promise anything else you can't personally deliver (no "I'll go check the ledger and get back to you").`
    );
  }

  return lines.join("\n");
}

/**
 * Marcus's injected persona context: the payout-pipeline counterpart to
 * buildEngineerPersonaContext. Marcus isn't on the incident fix, so his block
 * carries none of the fix-status timing; instead it carries the grounded
 * payout facts from worldCanon (PAYOUT_PIPELINE + MARCUS_ROLLBACK_CONCERN) so
 * a diligent player asking "if we roll back, anything I should worry about on
 * payouts?" gets the real, foreseeable downstream cost. It stays
 * decision-neutral (informs, never recommends) and is lightly time-aware only
 * to keep tense correct: if a rollback has already been chosen, the concern is
 * live rather than hypothetical.
 */
export function buildMarcusPersonaContext(ctx: DmAvailabilityContext & { clockMinutes: number }): string {
  const { stateBag, clockMinutes } = ctx;
  const rollbackChosen = stateBag.tradeoffChoice === "rollback";
  const patchChosen = stateBag.tradeoffChoice === "patch-forward";

  const lines: string[] = [];
  lines.push(
    `\n\nPAYOUT PIPELINE (private context, current as of ${formatSimClock(clockMinutes)}. Ground every answer in this and nothing beyond it. Do not invent numbers or facts not written here.):`
  );
  lines.push(
    `- Your own work today: hardening the seller payout pipeline that shipped last week, chasing a rare double-payout edge case for sellers with multiple bank accounts on file. You are NOT on the Apple Pay checkout incident; that's Jordan and Chen under Raj.`
  );
  lines.push(
    `- The in-flight fast-track payout batch has about ${PAYOUT_PIPELINE.fastTrackBatchSellers} sellers mid-cycle right now. That batch size is something you know from your own work. The exact count of sellers a rollback would set back, and the customer-facing impact, is Priya's read, not yours.`
  );
  lines.push(
    `- A rollback would push affected sellers back to the old cadence, about ${PAYOUT_PIPELINE.rollbackPayoutDelayDays} days slower to get paid.`
  );
  lines.push(
    `- What a rollback would mean for YOUR pipeline (state these plainly as risks/mechanics if the player asks what to worry about on payouts before a rollback, but never as a recommendation for or against rolling back):`
  );
  MARCUS_ROLLBACK_CONCERN.forEach((fact) => lines.push(`  - ${fact}`));

  if (rollbackChosen) {
    lines.push(
      `- A rollback has already been chosen for the incident. So the batch concern above is live now, not hypothetical: if nobody paused or reconciled the fast-track batch first, the old build plus mid-cycle records is exactly the setup for the double-payout edge case.`
    );
  } else if (patchChosen) {
    lines.push(
      `- The incident is being patched forward (payout speed kept), so payouts are untouched and the rollback concern above is not in play right now. You can still explain what a rollback WOULD have meant if the player asks.`
    );
  } else {
    lines.push(
      `- No fix path has been decided yet. Speak about the rollback concern as a "here's what would happen if we roll back," not as something already underway.`
    );
  }

  lines.push(
    `- Not your area: the Apple Pay incident root cause, the Stripe webhook, the fix ETA, and the rollback-vs-patch decision itself. Point the player to Raj for any of that. Never tell them which fix to pick.`
  );
  return lines.join("\n");
}

/**
 * Picks the right injected persona-context builder for a registry DM contact.
 * The incident-fix engineers (jordan/chen) get the live fix-status block; the
 * payout-adjacent contact (marcus) gets his payout-pipeline block. Keeps the
 * store generic: it calls this and doesn't branch on who the contact is.
 */
export function buildDmPersonaContext(
  contact: DmContact,
  ctx: DmAvailabilityContext & { clockMinutes: number }
): string {
  if (contact.role === "adjacent") return buildMarcusPersonaContext(ctx);
  return buildEngineerPersonaContext(contact, ctx);
}

/**
 * The scripted "the fix just landed" follow-up DM an engineer the player has
 * already been talking to fires once, automatically, the moment the fix
 * actually lands (see advanceClock's follow-up block). Delivered as a scripted
 * template rather than a generated reply on purpose: advanceClock is a
 * synchronous store action that also has to run in the headless test harness
 * (no reachable /api/agents/reply there), so this has to be deterministic and
 * self-contained. It's still fully grounded, every timing word comes straight
 * off the shared timeline, so it can't drift from what the persona says in
 * conversation. `timeline.landedAt` must be non-null (the caller only fires
 * this once landing is real).
 */
export function buildFixLandedFollowUp(contact: DmContact, timeline: IncidentTimeline): string {
  const at = timeline.landedAt !== null ? formatSimClock(timeline.landedAt) : "just now";
  const isRollback = timeline.fixPath === "rollback";
  const whatsIn = isRollback ? "Rollback's in" : "Patch is in";
  if (contact.role === "lead") {
    return isRollback
      ? `${whatsIn} as of ${at}. Watching the error rate come down now. Will shout if anything looks off.`
      : `${whatsIn} as of ${at}. Watching the error rate come down now. Will flag fast if it needs a second pass.`;
  }
  return isRollback
    ? `${whatsIn} as of ${at}, ran the checks with Jordan. Dashboard's heading back to normal. Will flag if anything looks off.`
    : `${whatsIn} as of ${at}, ran the checks with Jordan. Keeping an eye on the dashboard, will shout if it needs a second pass.`;
}

/* --------------------------------------------------------------------------
 * NPC-INITIATED FOLLOW-UP COPY (A2). The deterministic message builders for the
 * obligation engine (see obligations.ts). They live HERE, alongside
 * buildFixLandedFollowUp, for the same reasons: advanceClock is a synchronous
 * store action that also runs headless (no reachable /api/agents/reply), so an
 * NPC-initiated follow-up has to be deterministic and self-contained; and every
 * grounded timing/number word comes straight off the shared IncidentTimeline so
 * it can't drift from what the persona says in conversation. The engine itself
 * stays a ./types-only leaf and never imports the timeline: it returns firing
 * DESCRIPTORS and the store renders them through buildObligationMessageContent
 * below. A new obligation kind adds one more builder here plus its case.
 * -------------------------------------------------------------------------- */

/**
 * Raj's incident all-clear in #incidents, fired once metrics fully recover and
 * before the 11:00 formal resolution (the engine guarantees that side of the
 * collision). Grounded entirely in the timeline: the exact landing minute, the
 * exact fully-recovered minute, and the same Pulse reading the evaluator and the
 * engineer personas quote. Copy varies by fix path (a rollback is a clean
 * known-good revert; a patch is confirmed to have held without a second pass).
 * `timeline.fullyRecoveredAt` is expected non-null here (the caller only fires
 * this once metrics have recovered); the fallbacks keep it safe if ever called
 * earlier.
 */
export function buildRajAllClear(timeline: IncidentTimeline): string {
  const isRollback = timeline.fixPath === "rollback";
  const landed = timeline.landedAt !== null ? formatSimClock(timeline.landedAt) : "earlier";
  const recovered = timeline.fullyRecoveredAt !== null ? formatSimClock(timeline.fullyRecoveredAt) : "now";
  const pulse =
    timeline.fullyRecoveredAt !== null && timeline.decidedAt !== null
      ? dashboardReadingAt(timeline.fullyRecoveredAt, {
          incidentStartMinutes: INCIDENT_START_MINUTES,
          tradeoffChoice: timeline.fixPath,
          tradeoffDecidedAtMinutes: timeline.decidedAt,
        })
      : null;
  const pulseLine = pulse ? ` Dashboard's clean now: ${pulse}.` : "";
  return isRollback
    ? `All-clear from my side. Rollback went in at ${landed} and the checkout error rate was fully back to baseline by ${recovered}. It's stayed flat since, so I'm calling this stable and closing it out on eng.${pulseLine}`
    : `All-clear from my side. Patch went in at ${landed}, held without needing a second pass, and the checkout error rate was fully back to baseline by ${recovered}. Calling this stable and closing it out on eng.${pulseLine}`;
}

/**
 * Priya's single light nudge for the customer-facing draft after a stretch of
 * silence. Deliberately low-pressure ("no rush," "even a couple rough lines"):
 * a reminder, not a reprimand, since the engine only ever fires this when the
 * draft is genuinely still unattempted.
 */
export function buildPriyaCsNudge(): string {
  return "Hey, no rush at all, still hoping to grab that customer-facing note for my team whenever you get a sec. Even a couple rough lines works, I just want something accurate we can send out.";
}

/**
 * Priya's updated-context follow-up when the incident resolved before she ever
 * got a draft. Reflects the changed situation (it's resolved; her team has been
 * covering it) instead of re-asking cold, and leaves the door open without
 * nagging, so the thread closes honestly rather than dying silently.
 */
export function buildPriyaCsResolvedFollowUp(): string {
  return "Looks like the incident's been called resolved. I never got a customer-facing note from you, so my team's been fielding the Apple Pay tickets with our own holding message. If you still want to send wording for any follow-ups I'll take it, otherwise we've got it covered from here.";
}

/**
 * Priya's rollback-only seller-comms ask (B4), fired ~10 sim-minutes after the
 * rollback is decided. The seller-facing counterpart to her 9:26 customer-facing
 * ask and the natural follow-up to her 9:42 payout flag (priya-seller-payout-flag):
 * she flagged the seller cost before the call, and now that the rollback is in
 * she needs wording to get ahead of the seller tickets. Grounded in the payout
 * canon (PAYOUT_PIPELINE) so the count and delay agree with Marcus and Raj, and
 * in her voice: warm, concrete numbers, one point per sentence, no dashes. Only
 * ever rendered on the rollback path (the engine only fires this obligation when
 * a rollback seeded it), so it can state the rollback as a settled fact.
 */
export function buildPriyaSellerCommsAsk(): string {
  const sellers = PAYOUT_PIPELINE.fastTrackBatchSellers;
  const days = PAYOUT_PIPELINE.rollbackPayoutDelayDays;
  return `Okay, rollback's going in. That puts those roughly ${sellers} sellers from today's fast-track batch back on the old cadence, so they're waiting about ${days} extra days to get paid. I need to get ahead of the seller tickets before they start landing. Can you send me a seller-facing note explaining the payout delay? Doesn't need to be polished, just accurate enough that my team can hand it straight to sellers.`;
}

/**
 * Dispatches an obligation kind to its deterministic copy builder. The store
 * calls this per firing so the switch-on-kind lives here in the copy module,
 * next to the builders, rather than leaking into advanceClock. `timeline` is
 * passed for the grounded builders (Raj's all-clear); the Priya builders ignore
 * it. Exhaustive over ObligationKind: a new kind won't compile until it has a
 * case here.
 */
export function buildObligationMessageContent(kind: ObligationKind, timeline: IncidentTimeline): string {
  switch (kind) {
    case "raj-all-clear":
      return buildRajAllClear(timeline);
    case "priya-cs-nudge":
      return buildPriyaCsNudge();
    case "priya-cs-resolved-followup":
      return buildPriyaCsResolvedFollowUp();
    case "priya-seller-comms-ask":
      return buildPriyaSellerCommsAsk();
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
