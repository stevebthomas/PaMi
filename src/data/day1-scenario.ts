import type { ScenarioEvent, StateBag } from "../lib/sim/types";
import { useTaskflowStore } from "../store/taskflowStore";
// Imported from the leaf payoutCanon module, NOT from worldCanon, on purpose:
// worldCanon -> incidentTimeline -> day1-scenario is a real init cycle, and
// importing worldCanon here would close it. payoutCanon has no imports, so this
// is safe. worldCanon re-exports these same names for everyone else.
import { PAYOUT_PIPELINE } from "../lib/sim/payoutCanon";
// commitments.ts imports ONLY from types.ts, so this stays clear of the
// worldCanon -> incidentTimeline -> day1-scenario init cycle documented above.
import { recordFixDecisionAck, recordPlayerOwesCsTemplate } from "../lib/sim/commitments";
// obligations.ts likewise imports ONLY from types.ts (same leaf discipline), so
// seeding NPC-initiated follow-ups from these applyEffects is cycle-safe.
import {
  seedRajAllClear,
  seedPriyaCsNudge,
  seedPriyaCsResolvedFollowUp,
  seedPriyaSellerCommsAsk,
} from "../lib/sim/obligations";

/** True when the player DMed Marcus about payouts BEFORE the fix decision was
 * made, i.e. in time to actually act on his warning (pause/reconcile the
 * batch). Consulting him only after the decision is too late to prevent the
 * inconsistency, so it does NOT count here (matches Part 6's "null OR after
 * the decision" wording for the inconsistency branch). Shared by the payout
 * consequence beats below so the positive and negative branches can never
 * both fire. */
function consultedMarcusInTime(state: StateBag): boolean {
  return (
    state.marcusConsultedAtMinutes !== null &&
    state.tradeoffDecidedAtMinutes !== null &&
    state.marcusConsultedAtMinutes <= state.tradeoffDecidedAtMinutes
  );
}

/** Raj's 9:38 rollback-vs-patch offer text. Extracted to a const so it stays the
 * single source of truth for BOTH the scripted beat's static `content` (also the
 * reference framing handed to the tradeoff classifier in simStore) and the
 * undecided fallback branch of that beat's contentFor: the two can't drift. */
const RAJ_TRADEOFF_OFFER_CONTENT =
  "Ok, two ways to fix this and honestly neither is clean. (1) Roll back payment-service to before last week's payout-speed update. That reverts to the old webhook retry logic, which we know doesn't hit this Stripe flakiness, so it's the sure thing, maybe 10 min. Catch is it pulls last week's faster seller payouts, and I don't have the numbers on who's mid-cycle right now. That's Priya's read, not mine. (2) Patch the retry/idempotency handling in place and keep payout speed. More like 30 min. My honest catch here: I haven't been able to reproduce the exact Stripe failure, so I can't promise the patch fully covers it on the first ship. Might hold, might need a second pass. Which way do you want to go?";

/** Priya's 9:42 seller-payout heads-up, undecided-state text. Extracted to a
 * const so the priya-seller-payout-flag beat's static `content` and the still-
 * undecided fallback branch of its contentFor stay the single same source (same
 * anti-drift reason as RAJ_TRADEOFF_OFFER_CONTENT above). The "...if that'd help
 * you decide" tail only makes sense while the call is still open; once a decision
 * is on the record, contentFor recasts her flag as reacting to the made call. */
const PRIYA_SELLER_PAYOUT_FLAG_CONTENT =
  "Saw Raj's rollback option. Flagging early so it's not a surprise: that faster-payout change is something my sellers actually noticed. I've got people who moved their own cash flow around it. A rollback puts them back on the old cadence. Not telling you which way to go, just want a heads up before it happens so I can get ahead of the seller tickets. I can pull the exact count of who's affected if that'd help you decide.";

/**
 * Day 1 (Monday) scripted timeline: the payment gateway incident.
 * These are the fixed, system-authored beats. On top of this, any player
 * message sent in a channel/DM where an NPC is present triggers a live
 * AI-generated reply from that NPC (see src/lib/sim/reactive.ts). That's
 * what makes Raj push back on vague asks and go along with clear ones,
 * instead of hardcoding three canned branches.
 */
/** Scenario name shown on the scorecard and in the Reviews app. Keyed by
 * day number so future days can add their own entry here. */
export const SCENARIO_LABELS: Record<number, string> = {
  1: "Payment incident",
};

/** Hard sim-time end-of-day boundary, per day: once clockMinutes reaches
 * this, the day ends automatically regardless of postmortem status. Keeps
 * "+15m" from being clickable forever (previously observed reaching well
 * past midnight with no end-of-day behavior at all). 1080 = 6:00 PM. */
export const DAY_END_MINUTES: Record<number, number> = {
  1: 1080,
};

/** Sim-time each day starts at: paired with DAY_END_MINUTES to express
 * "how far through the day are we," used by the ambient lighting shift and
 * the battery indicator. 510 = 8:30 AM. */
export const DAY_START_MINUTES: Record<number, number> = {
  1: 510,
};

export const day1ScenarioEvents: ScenarioEvent[] = [
  {
    id: "sys-welcome",
    day: 1,
    triggerTimeMinutes: 510, // 8:30 AM
    eventType: "notification",
    agentId: "system",
    channel: "general",
    content:
      "Welcome to BazaarLoop. Today is Monday, your first day owning the buyer experience surface area. Keep an eye on #general and #incidents. The day starts now.",
  },
  {
    // Fires at the same clock minute as sys-welcome so Derek's DM is never
    // empty on first open (previously silent from 8:30 AM session start
    // until his 1:30 PM escalation, which read as broken on day one).
    // Deliberately generic first-day warmth, not a task: no requiresResponse,
    // no tooling orientation, and no promise of constant availability, so it
    // doesn't sit oddly next to his later "just saw the #incidents thread"
    // recap ask.
    id: "derek-welcome-dm",
    day: 1,
    triggerTimeMinutes: 510, // 8:30 AM
    eventType: "chattr_message",
    agentId: "derek",
    channel: "dm_derek",
    content:
      "Morning, and welcome to BazaarLoop. Glad to finally have someone owning search through checkout, it's been on my plate too long. Get settled in today, nothing urgent from me right now. I'm in and out of meetings but ping me if you need anything, I'll get back to you when I can. Oh, and I attached the intro doc I send every new hire, worth a skim when you get a minute.",
    attachment: { label: "Welcome to BazaarLoop.md", docId: "derek-welcome-doc" },
  },
  {
    id: "raj-standup-heads-up",
    day: 1,
    triggerTimeMinutes: 515, // 8:35 AM
    eventType: "chattr_message",
    agentId: "raj",
    channel: "general",
    content: "Morning everyone, standup in 25",
  },
  {
    id: "priya-heads-up-dm",
    day: 1,
    triggerTimeMinutes: 525, // 8:45 AM
    eventType: "chattr_message",
    agentId: "priya",
    channel: "dm_priya",
    content:
      "Hey, heads up, got a few support tickets overnight about checkout failures. Not sure if it's a pattern yet. Wanted to flag before standup.",
    facts: ["A few support tickets overnight about checkout failures (not yet confirmed as a pattern)"],
    // Was previously silent-by-default: nothing tracked whether the player
    // engaged before the 9:15 escalation, so an ignored heads-up and a
    // read-and-ignored one looked identical. Now it's a real ask with a
    // real consequence for silence (the follow-up below), same as every
    // other requiresResponse event.
    requiresResponse: true,
    responseDeadlineMinutes: 30,
  },
  {
    id: "priya-early-followup",
    day: 1,
    triggerTimeMinutes: 545, // 9:05 AM
    eventType: "chattr_message",
    agentId: "priya",
    channel: "dm_priya",
    content: "Volume's still climbing on those checkout tickets. Did you get a chance to look?",
    reAsks: "priya-heads-up-dm",
    condition: (state) => !("priya-heads-up-dm" in state.respondedAtMinutes),
  },
  {
    id: "standup",
    day: 1,
    triggerTimeMinutes: 540, // 9:00 AM
    eventType: "chattr_message",
    agentId: "system",
    channel: "general",
    content:
      "**Daily Standup, 9:00 AM**\n\n**Raj:** \"Jordan and Chen are mid-sprint on the checkout redesign, no blockers there. Rest of the team's heads-down on their own stuff. I want eyes on payment service tech debt soon.\"\n**Priya:** \"Support queue's a little heavier than usual this morning, mostly checkout-related. Keeping an eye on it.\"\n**Design:** \"Heads-down on the listing page wireframes this morning, will post something in #design-review around midday.\"\n\n*Nothing here is flagged urgent, but you've already heard from Priya once this morning.*",
  },
  {
    id: "priya-incidents-escalation",
    day: 1,
    triggerTimeMinutes: 555, // 9:15 AM
    eventType: "chattr_message",
    agentId: "priya",
    channel: "incidents",
    content:
      "OK this is escalating. 14 tickets in the last hour about failed payments. All Apple Pay. CS is getting slammed.",
    requiresResponse: true,
    responseDeadlineMinutes: 30,
    facts: ["14 tickets in the last hour, all Apple Pay", "CS is getting slammed"],
  },
  {
    id: "raj-diagnosis",
    day: 1,
    triggerTimeMinutes: 560, // 9:20 AM
    eventType: "chattr_message",
    agentId: "raj",
    channel: "incidents",
    content:
      "Just checked. Stripe webhook for Apple Pay is returning 500s on ~3% of attempts. Not a full outage but it's bleeding.",
    facts: ["Stripe webhook for Apple Pay returning 500s on ~3% of attempts", "Not a full outage, but bleeding"],
  },
  {
    id: "raj-ownership-check",
    day: 1,
    triggerTimeMinutes: 572, // 9:32 AM: 12 min after his own diagnosis
    eventType: "chattr_message",
    agentId: "raj",
    channel: "incidents",
    // His own diagnosis two beats ago can read as "handled": this makes
    // the un-assigned ownership visible without stating what to choose,
    // instead of just quietly waiting for raj-nudge 13 minutes later.
    content: "I can pull Jordan or Chen off the redesign for the retry/idempotency fix, or leave them on it, that's your call.",
    condition: (state) => !("priya-incidents-escalation" in state.respondedAtMinutes),
  },
  {
    // The real fix decision, live rather than narrated after the fact.
    // Reframed as "last week's" change (not "this morning's") specifically
    // so it doesn't contradict Raj's established fact that nothing shipped
    // in the last 24 hours caused this incident: the root cause is still
    // genuinely Stripe-side; the FIX path chosen is what touches the
    // recent seller-side change, not the incident's cause.
    id: "raj-tradeoff-offer",
    day: 1,
    triggerTimeMinutes: 578, // 9:38 AM
    eventType: "chattr_message",
    agentId: "raj",
    channel: "incidents",
    // Reworked so neither option is a clean win (three playtest personas
    // independently flagged the old binary as toothless: Raj did all the
    // diagnostic work and handed a choice where every incentive pointed one
    // way). Now BOTH sides carry real, opposite-facing uncertainty: rollback
    // is the sure fix but has a concrete seller-payout cost Raj can't size
    // himself (that's Priya's read, see priya-seller-payout-flag), and the
    // patch keeps payouts but Raj honestly can't promise it covers the exact
    // failure on the first ship. The root cause is still Stripe-side webhook
    // flakiness; nothing shipped in the last 24h caused it; the incident
    // still resolves at 11:00 either way. The uncertainty here is
    // decision-TIME uncertainty, which is what makes the call hard without
    // changing the graded-handling-not-choice contract.
    content: RAJ_TRADEOFF_OFFER_CONTENT,
    // If the player already made the call before this 9:38 beat lands (Raj's
    // live persona surfaces and accepts the rollback/patch choice well before
    // the scripted offer, see the raj-diagnosis-gated tradeoff evaluator in
    // simStore), re-asking "which way do you want to go?" would be a false
    // re-ask that contradicts a decision already on the record (same class as
    // fix 1a's derek re-ask). So render Raj CONFIRMING the already-made call
    // in-channel for the record instead. The beat still fires (its facts[]
    // carry the rollback/patch options into the UI checklist either way), and
    // the static `content` above stays the classifier's reference framing. Only
    // the player-decision path can reach this branch at 9:38: the Raj-fallback
    // decision doesn't land until ~10:05-10:20, so tradeoffChoice is still null
    // here on that path and the normal offer renders.
    contentFor: (state) => {
      if (state.tradeoffChoice === "rollback") {
        return "Logging this in the channel for the record: we're rolling back payment-service to before last week's payout-speed update. Known-good fix, about 10 min, Jordan and Chen are on it. It does pull last week's faster seller payouts, so that's a seller-comms thing for Priya to get ahead of.";
      }
      if (state.tradeoffChoice === "patch-forward") {
        return "Logging this in the channel for the record: we're going patch-forward and keeping payout speed. Jordan and Chen are on the retry/idempotency fix now, roughly 30 min. Same honest caveat I gave you: I couldn't reproduce the exact Stripe failure, so it might need a second pass. I'll flag fast if it does.";
      }
      return RAJ_TRADEOFF_OFFER_CONTENT;
    },
    facts: [
      "Rollback: ~10 min, known-good fix (old retry logic doesn't hit the Stripe flakiness), but reverts last week's faster seller payouts",
      "Patch-forward: ~30 min, keeps seller payout speed, but Raj can't confirm it fully covers the failure on the first ship (he hasn't reproduced the exact Stripe failure)",
      "Raj doesn't have the seller-payout exposure numbers; that's Priya's read",
    ],
  },
  {
    // New: makes the rollback's seller cost a stake someone actually holds,
    // landing in the same 9:35-10:00 window as the fix decision so the player
    // is weighing a real cross-functional cost under time pressure, not a
    // shruggable footnote. Priya flags the stake but deliberately does NOT
    // hand over the size: the exact count lives in her persona prompt and
    // only surfaces if the player asks (see prompts.ts). Stays neutral on the
    // choice per TRADEOFF_NEUTRALITY_RULE: she names the cost and offers the
    // number, she doesn't argue against rollback. No requiresResponse: it's
    // information/stake, not another mandatory ack. Fires at 582 (4 min after
    // Raj's 578 offer) so there's never a wall of simultaneous messages.
    id: "priya-seller-payout-flag",
    day: 1,
    triggerTimeMinutes: 582, // 9:42 AM
    eventType: "chattr_message",
    agentId: "priya",
    channel: "incidents",
    content: PRIYA_SELLER_PAYOUT_FLAG_CONTENT,
    // Fix 1c-follow-up (same false-re-ask class as raj-tradeoff-offer). This
    // beat is unconditional at 9:42, so when the player made the fix call early
    // (Raj's raj-diagnosis-gated evaluator registers it before 9:38), Priya's
    // "...if that'd help you decide" would land AFTER the decision is on the
    // record: offering to size a choice already made. So recast her flag to
    // react to the made call. facts[] stay as-is: the rollback-consequence facts
    // are true background either way (they describe what a rollback WOULD do).
    // The Raj-fallback decision doesn't land until ~10:05-10:20, so on that path
    // tradeoffChoice is still null here at 9:42 and the undecided flag renders.
    contentFor: (state) => {
      if (state.tradeoffChoice === "patch-forward") {
        return "Saw the call land, patch-forward it is. That keeps payout speed live for my sellers, so they stay on the faster cadence and I don't need anything from you on the seller side. One thing: if this turns into a rollback after all, flag me first so I can get ahead of the seller tickets before they start landing.";
      }
      if (state.tradeoffChoice === "rollback") {
        return "Saw the call, we're rolling back. That puts my fast-track sellers back on the old, slower cadence, and some of them planned their cash flow around last week's faster payouts. I'm getting ahead of the seller tickets now so it doesn't blindside them. I can pull the exact count of who's affected so we know how big the seller comms need to be, want me to grab it?";
      }
      return PRIYA_SELLER_PAYOUT_FLAG_CONTENT;
    },
    facts: [
      "A rollback pushes affected sellers back to the old, slower payout cadence",
      "Some sellers have already planned their cash flow around last week's faster payouts",
      "Priya can pull the exact count of sellers affected by a rollback if asked",
    ],
  },
  {
    id: "priya-template-request",
    day: 1,
    triggerTimeMinutes: 566, // 9:26 AM: right after Raj's diagnosis gives enough facts to write something accurate
    eventType: "chattr_message",
    agentId: "priya",
    channel: "dm_priya",
    content: "Whenever you get a sec, can you send me something I can hand my team to tell customers? Doesn't need to be polished, just accurate.",
    // Record the player-owes-Priya obligation the moment she asks, so her later
    // replies can reference it as already-known ("still need that draft") rather
    // than re-asking cold. Settled in the store's CS-template block once a good
    // template is delivered. Idempotent by stable id (advanceClock is
    // re-entrant); 566 mirrors this event's own triggerTimeMinutes.
    //
    // A2: also seed Priya's two NPC-initiated follow-ups here, both keyed to
    // this same ask time (566): a one-time light nudge if the draft is still not
    // attempted ~45 min later, and an updated-context follow-up if the incident
    // resolves while it's still not attempted. Both settle silently the moment
    // the player attempts a draft (see obligations.ts). Idempotent by stable id.
    applyEffect: (state) => ({
      commitmentLedger: recordPlayerOwesCsTemplate(state.commitmentLedger, 566),
      pendingObligations: seedPriyaCsResolvedFollowUp(seedPriyaCsNudge(state.pendingObligations, 566), 566),
    }),
  },
  {
    id: "raj-nudge",
    day: 1,
    triggerTimeMinutes: 585, // 9:45 AM
    eventType: "chattr_message",
    agentId: "raj",
    channel: "dm_raj",
    content: "Hey, are you seeing the incidents channel? Kind of need a call on this.",
    reAsks: "priya-incidents-escalation",
    condition: (state) => !("priya-incidents-escalation" in state.respondedAtMinutes),
    applyEffect: () => ({ rajMood: "frustrated" }),
  },
  {
    id: "priya-no-response-fallback",
    day: 1,
    triggerTimeMinutes: 600, // 10:00 AM
    eventType: "chattr_message",
    agentId: "priya",
    channel: "dm_priya",
    content: "CS is asking me what to tell customers. I don't have an answer. Can you loop in?",
    reAsks: "priya-incidents-escalation",
    condition: (state) => !("priya-incidents-escalation" in state.respondedAtMinutes),
    applyEffect: () => ({ priyaMood: "overwhelmed" }),
  },
  {
    // Consequence for never answering Raj's 9:38 rollback-vs-patch-forward
    // offer (raj-tradeoff-offer): by 10:20, Raj's given up waiting on the PM,
    // WEIGHED THE TRADEOFF HIMSELF (a real model call, see rajFallbackDecision
    // in the store and /api/agents/raj-fallback-decision), made the call, and
    // looped Derek in. Derek relays Raj's actual choice AND his actual reasoning
    // here, so a disengaged player no longer sees the identical hardcoded
    // "rollback" line every playthrough.
    //
    // The condition now also gates on rajFallbackDecision existing: the store
    // kicks off Raj's decision call around 10:05, and if it hasn't resolved by
    // the time 10:20 is crossed, this escalation HOLDS (doesn't fire on a
    // stale/empty decision) until the decision lands, then delivers at the
    // current clock. If the player decides first, tradeoffChoice is non-null
    // and this never fires. If the model call fails outright, the store writes
    // a deterministic scripted decision so this still fires (API-failure path
    // only; see the store's kickoff block).
    id: "derek-tradeoff-escalation",
    day: 1,
    triggerTimeMinutes: 620, // 10:20 AM
    eventType: "chattr_message",
    agentId: "derek",
    channel: "dm_derek",
    // Static fallback line (used only by consumers that don't call contentFor,
    // e.g. the headless playtest mirror, where the persona always answers Raj
    // so this beat doesn't fire anyway). The live app renders contentFor.
    content:
      "Raj looped me in since he couldn't reach you on the fix call. He made the call himself, we couldn't sit on it. Loop back with me when you're around.",
    contentFor: (state) => {
      // Only assert "couldn't reach you" when the player genuinely never
      // engaged Raj on the tradeoff. If they were in an active thread with him
      // after the offer (tradeoffEngagedWithRajAtMinutes set) but never landed
      // a decision, the truthful framing is "you went quiet," not "unreachable."
      const engaged = state.tradeoffEngagedWithRajAtMinutes !== null;
      const prefix = engaged
        ? "Raj looped me in on the fix call. You'd gone quiet after you two were talking it through and he couldn't sit on it, so he made the call himself."
        : "Raj looped me in since he couldn't reach you on the fix call. He made the call himself, we couldn't sit on it.";
      const d = state.rajFallbackDecision;
      if (!d) return `${prefix} Loop back with me when you're around.`;
      const label = d.choice === "rollback" ? "the rollback" : "the patch-forward fix";
      // Quote Raj's reasoning as relayed speech rather than concatenating it
      // bare, otherwise his first-person rationale renders in Derek's mouth
      // ("...with Derek standing by," said by Derek). "His words:" makes the
      // first-person pronouns unambiguously Raj's.
      return `${prefix} He went with ${label}. His words: "${d.reasoning.trim()}" Loop back with me when you're around.`;
    },
    condition: (state) => state.tradeoffChoice === null && state.rajFallbackDecision !== null,
    // Read the choice and timing straight off Raj's decision, no longer a
    // hardcoded "rollback". decidedAtMinutes is the clock at which the decision
    // landed (set by the store when the call resolved), so it's truthful even
    // if the call resolved after 10:20 and this beat was held.
    applyEffect: (state) =>
      state.rajFallbackDecision
        ? {
            tradeoffChoice: state.rajFallbackDecision.choice,
            tradeoffDecidedAtMinutes: state.rajFallbackDecision.decidedAtMinutes,
            tradeoffEscalatedToDerek: true,
            // Same decision-acknowledged ledger entry as the player-decision
            // path, but marked as Raj's own fallback call, so his later replies
            // treat the fix he chose as settled context rather than re-deciding
            // it. Born settled; idempotent by stable id (advanceClock is
            // re-entrant). The engineers' fix-landed commitment is recorded on
            // the player-decision path (where the fix ticket is registered), not
            // here; see commitments.ts and the store's Feature B block.
            commitmentLedger: recordFixDecisionAck(state.commitmentLedger, {
              choice: state.rajFallbackDecision.choice,
              channel: "incidents",
              atSimMinutes: state.rajFallbackDecision.decidedAtMinutes,
              where: "the fix call",
              decidedByRaj: true,
            }),
            // A2: seed Raj's all-clear obligation on the fallback path too, the
            // same one the player-decision path seeds in simStore's Feature B
            // block. Once Raj made the call himself, he still follows through
            // with the all-clear once metrics recover (unless the 11:00
            // resolution beats him). Keyed to when the decision actually landed.
            // B4: on the rollback path ONLY, also seed Priya's seller-comms ask
            // (the rollback-only downstream obligation for the payout delay),
            // the same one simStore's Feature B block seeds on the player path.
            // Gated on the fallback choice being a rollback; patch-forward never
            // seeds it, so it can never fire there. Keyed to the same minute the
            // decision actually landed. Idempotent by stable id.
            pendingObligations:
              state.rajFallbackDecision.choice === "rollback"
                ? seedPriyaSellerCommsAsk(
                    seedRajAllClear(state.pendingObligations, state.rajFallbackDecision.decidedAtMinutes),
                    state.rajFallbackDecision.decidedAtMinutes
                  )
                : seedRajAllClear(state.pendingObligations, state.rajFallbackDecision.decidedAtMinutes),
          }
        : {},
    facts: [
      // Neutral wording, true whether the player went quiet mid-thread or was
      // never reachable: the contested "couldn't reach you" claim lives only
      // in contentFor's not-engaged branch, never in this static checklist fact.
      "Raj made the fix call himself and looped Derek in",
      "Derek relayed which fix Raj chose and why",
    ],
  },
  {
    // Makes the decision visible where it was actually asked (#incidents),
    // not just in the DM Derek sent it through. Fires 2 min after Derek's
    // escalation above; same condition so it only appears alongside it.
    // Renders Raj's own words (derekLine) so it's consistent with, but not a
    // word-for-word copy of, what Derek relayed.
    id: "raj-tradeoff-escalation-followup",
    day: 1,
    triggerTimeMinutes: 622, // 10:22 AM
    eventType: "chattr_message",
    agentId: "raj",
    channel: "incidents",
    content: "Couldn't reach the PM on the fix call, so I made the call. Starting now.",
    contentFor: (state) => {
      // Same truthfulness split as Derek's DM above: "couldn't reach the PM"
      // only when the player never engaged Raj on this call. If they were in an
      // active thread with him after his offer but never decided, he says the
      // PM went quiet, not that he couldn't reach them.
      const lead =
        state.tradeoffEngagedWithRajAtMinutes !== null
          ? "PM went quiet on the fix call and we couldn't wait any longer, so I made the call."
          : "Couldn't reach the PM on the fix call, so I made the call.";
      const tail = state.rajFallbackDecision ? state.rajFallbackDecision.derekLine : "Starting now.";
      return `${lead} ${tail}`;
    },
    condition: (state) => state.tradeoffChoice === null || state.tradeoffEscalatedToDerek === true,
    facts: ["Raj made the fix call himself and it's underway"],
  },
  {
    // Ambient texture, not a task: fills the 11 AM-12:30 PM dead stretch
    // between resolution and Maya's beat with a sign that the company has
    // its own life outside the player's incident, same principle as the
    // Office roster's Marcus/Ines/Theo having independent work. Not graded
    // (channel isn't in GRADED_CHANNELS), no requiresResponse, no deadline,
    // no nudge if ignored: purely optional flavor either way.
    id: "theo-random-bathroom",
    day: 1,
    triggerTimeMinutes: 675, // 11:15 AM
    eventType: "chattr_message",
    agentId: "theo",
    channel: "random",
    content: "Hey, dumb question probably, but does anyone know where the bathroom is on this floor? I've been wandering for like five minutes 😅",
    easterEgg: { label: "Helped Theo find the bathroom" },
  },
  {
    // Second ambient beat, same rules as theo-random-bathroom above: fills
    // the 1:50 PM-3:30 PM dead stretch between Derek's check-in and the
    // postmortem prompt.
    id: "theo-random-lunch",
    day: 1,
    triggerTimeMinutes: 855, // 2:15 PM
    eventType: "chattr_message",
    agentId: "theo",
    channel: "random",
    content: "Is anyone doing a lunch order today? If so, count me in, I completely forgot to bring anything 🙃",
    easterEgg: { label: "Joined Theo's lunch order" },
  },
  {
    // Maya's ask is a deliberately low-stakes, unrelated-to-the-incident
    // interruption during the midday lull between the morning incident and
    // Derek's early-afternoon check-in: see prompts.ts's EVALUATOR_PROMPT
    // #design-review special case for how this gets graded (handling, not
    // which option gets picked). References Theo's actual Office-roster
    // ticket rather than inventing new work.
    id: "maya-design-question",
    day: 1,
    triggerTimeMinutes: 750, // 12:30 PM
    eventType: "chattr_message",
    agentId: "maya",
    channel: "design-review",
    content:
      "Hey, whenever you get a sec, need a quick call on Theo's wishlist ticket. Deciding between a small 'saved!' animation when you tap save-for-later, or keeping it silent and instant. Not urgent, just want to lock it before we ship Thursday. Which do you prefer? Attaching both mockups so you can compare.",
    requiresResponse: true,
    responseDeadlineMinutes: 120,
    attachments: [
      { label: "Saved Animation Mockup.md", docId: "maya-mockup-saved-animation" },
      { label: "Silent Instant Mockup.md", docId: "maya-mockup-silent-instant" },
    ],
  },
  {
    id: "derek-notification",
    day: 1,
    triggerTimeMinutes: 809, // 1:29 PM
    eventType: "notification",
    agentId: "system",
    channel: "dm_derek",
    content: "Derek (VP Product) has messaged you.",
  },
  {
    id: "derek-escalation",
    day: 1,
    triggerTimeMinutes: 810, // 1:30 PM
    eventType: "chattr_message",
    agentId: "derek",
    channel: "dm_derek",
    // Fires well after resolution-good/resolution-cold (11 AM), so this is
    // a retroactive recap ask, not a live "what's the ETA" one: Derek is
    // catching up for a leadership sync, not tracking the incident in
    // real time.
    content:
      "Saw the incident thread, looks like it's resolved. Can you get me the blast radius and what actually happened? Need it before our afternoon sync with the CEO.",
    // If the player already briefed Derek on the incident earlier
    // (derekBriefedOnIncidentAtMinutes set), don't cold re-ask for a blast
    // radius he already has: acknowledge the earlier rundown and ask only to
    // confirm the final numbers before the sync. Still requiresResponse either
    // way, so the deliverable mechanic is unchanged; only the false re-ask goes.
    contentFor: (state) =>
      state.derekBriefedOnIncidentAtMinutes !== null
        ? "Thanks for the earlier rundown on the Apple Pay incident, that's what I needed. Before our afternoon sync with the CEO, can you just confirm the final blast radius numbers so I've got them exact?"
        : "Saw the incident thread, looks like it's resolved. Can you get me the blast radius and what actually happened? Need it before our afternoon sync with the CEO.",
    requiresResponse: true,
    responseDeadlineMinutes: 20,
    // Derek references the #incidents thread directly, so a summary
    // posted there (where Raj/Priya can also see and correct it) is a
    // reasonable way to answer him too, not just a DM reply.
    alsoSatisfiedByChannels: ["incidents"],
  },
  {
    id: "derek-followup",
    day: 1,
    triggerTimeMinutes: 830, // 1:50 PM: 20 min after his own ask, matching his stated deadline
    eventType: "chattr_message",
    agentId: "derek",
    channel: "dm_derek",
    content: "Still need that recap before the afternoon sync. What happened?",
    // Keep the chase consistent with whichever version of the ask Derek sent:
    // if he already had the earlier rundown, he's chasing the number
    // confirmation, not the whole recap, so it doesn't contradict his own
    // "thanks for the earlier rundown" line above.
    contentFor: (state) =>
      state.derekBriefedOnIncidentAtMinutes !== null
        ? "Still need those final blast radius numbers confirmed before the afternoon sync."
        : "Still need that recap before the afternoon sync. What happened?",
    condition: (state) => !("derek-escalation" in state.respondedAtMinutes),
  },
  {
    // Ambient pressure for the Task Assignment realism feature
    // (realism-features.md): the critical payment-fix ticket left
    // unassigned past this point gets a light, no-tutorial-popup nudge:
    // the world just reacts, same principle as raj-nudge/derek-followup
    // above. Condition reaches into taskflowStore directly (not stateBag)
    // since ticket assignment lives there, not in the sim's state bag:
    // stateBag.tradeoffTicketId is only the id pointer into that board.
    id: "derek-unassigned-fix-nudge",
    day: 1,
    triggerTimeMinutes: 875, // 2:35 PM
    eventType: "chattr_message",
    agentId: "derek",
    channel: "dm_derek",
    content: "Random thing while I'm in here, who's actually credited as owning the payment fix in Taskflow? Want that clean before this comes up again.",
    condition: (state) => {
      if (!state.tradeoffTicketId) return false;
      const ticket = useTaskflowStore.getState().tickets.find((t) => t.id === state.tradeoffTicketId);
      return Boolean(ticket) && !ticket!.assigneeId;
    },
  },
  {
    // CONSEQUENCE BEAT (Part 6): the rollback's discoverable-through-diligence
    // downstream cost. Fires ONLY on a rollback path where the player did NOT
    // consult Marcus in time (marcusConsultedAtMinutes null, or only after the
    // decision was already made). Marcus is on the payout pipeline all day one
    // DM away, so this cost was foreseeable, invisible only to a player who
    // never asked. Numbers come from canon (PAYOUT_PIPELINE), never invented
    // here. Fires at 2:30 PM (870), deliberately clear of the neighbors:
    // 855 theo-random-lunch, 875 derek-unassigned-fix-nudge, 930 postmortem,
    // 950 derek-postmortem-nudge. Nothing fires on patch-forward (payouts
    // untouched) or on a rollback where Marcus was consulted in time (the
    // positive beat below fires instead).
    id: "marcus-payout-inconsistency",
    day: 1,
    triggerTimeMinutes: 870, // 2:30 PM
    eventType: "chattr_message",
    agentId: "marcus",
    channel: "incidents",
    content: `Heads up, the rollback caught the fast-track batch mid-cycle. I'm seeing ${PAYOUT_PIPELINE.duplicatePayoutSellersOnRollback} sellers with multiple bank accounts on file showing a duplicate payout entry from this morning's run. Reconciling now, but this is exactly the edge case I was chasing. Would've paused the batch if I'd known the rollback was coming.`,
    condition: (state) => state.tradeoffChoice === "rollback" && !consultedMarcusInTime(state),
    applyEffect: () => ({ payoutInconsistencySurfaced: true }),
    facts: [
      `The rollback caught the fast-track payout batch mid-cycle, and ${PAYOUT_PIPELINE.duplicatePayoutSellersOnRollback} sellers with multiple bank accounts show a duplicate payout entry`,
      "This is the double-payout edge case Marcus had been chasing; he'd have paused the batch first if he'd known the rollback was coming",
    ],
  },
  {
    // Priya's follow-up to the inconsistency above: the affected sellers are
    // now surfacing on her side. Same condition as Marcus's beat (not gated on
    // his applyEffect flag, since conditions are evaluated against the pre-tick
    // state, so the flag isn't set yet within this same advanceClock tick), so
    // the two land together. Fires 2 min later (872) to avoid a same-minute
    // wall of messages.
    id: "priya-payout-inconsistency-followup",
    day: 1,
    triggerTimeMinutes: 872, // 2:32 PM
    eventType: "chattr_message",
    agentId: "priya",
    channel: "incidents",
    content: `Confirming from my side: I've got sellers filing tickets about a duplicate payout showing up after the rollback. Working the reconcile with Marcus. Getting ahead of the seller replies now, but flagging it so it's on the record.`,
    condition: (state) => state.tradeoffChoice === "rollback" && !consultedMarcusInTime(state),
    facts: [
      "Affected sellers are filing tickets about the duplicate payout entry after the rollback",
      "Priya and Marcus are reconciling the batch together",
    ],
  },
  {
    // POSITIVE BEAT (Part 6): the reward for diligence. Fires ONLY on a
    // rollback path where the player consulted Marcus in time (before the
    // decision), so he could pause and reconcile the batch first. No
    // inconsistency in this branch. Lands in Marcus's own DM (dm_marcus) since
    // it's a callback to a conversation the player actually had with him
    // there. Mutually exclusive with the two beats above by construction (the
    // consultedMarcusInTime split). Nothing fires on patch-forward.
    id: "marcus-payout-clean",
    day: 1,
    triggerTimeMinutes: 870, // 2:30 PM
    eventType: "chattr_message",
    agentId: "marcus",
    channel: "dm_marcus",
    content: "Paused the fast-track batch before the rollback like we discussed, reconciled clean, no dupes. Pipeline's fine on the old build. Thanks for the heads up.",
    condition: (state) => state.tradeoffChoice === "rollback" && consultedMarcusInTime(state),
    facts: [
      "Because you flagged it in time, Marcus paused and reconciled the fast-track batch before the rollback, so no duplicate payouts",
    ],
  },
  {
    // Used to fire unconditionally, so total inaction and a well-handled
    // incident produced the identical "CS has the latest guidance" line:
    // untrue for a player who never gave CS anything. Now split into THREE
    // mutually-exclusive, exhaustive variants keyed purely on the delivered
    // CS-note state, so the fired narrative can never contradict what the
    // player actually handed Priya (the bug in scenario-audit-day1.md §11):
    //   good    → csTemplateProvided                                    (this)
    //   partial → !csTemplateProvided && attempted (a note, judged weak)
    //   cold    → !csTemplateProvided && never attempted (no note at all)
    // The earlier `"priya-incidents-escalation" in respondedAtMinutes`
    // coupling was dropped from `good`: a genuinely good customer-facing note
    // is a good note whether or not the player also acked the #incidents
    // escalation, and none of these three texts asserts anything about that
    // ack, so keying purely on CS-note state is both simpler and strictly
    // more truthful. The three conditions below partition every state (good
    // implies attempted, so it can never overlap partial/cold).
    id: "resolution-good",
    day: 1,
    triggerTimeMinutes: 660, // 11:00 AM
    eventType: "chattr_message",
    agentId: "system",
    channel: "general",
    content:
      "**Resolution update.** Engineering shipped a fix for the Apple Pay webhook. Checkout success rate is back at baseline. CS has the latest guidance. Total incident duration: ~2 hours.",
    facts: ["Fix shipped, checkout success rate back at baseline", "Total incident duration ~2 hours"],
    condition: (state) => state.csTemplateProvided,
  },
  {
    // PARTIAL variant: the player DID send a customer-facing note (attempted),
    // but the CS-template evaluator judged it weak (not grounded / thin /
    // overpromising, csTemplateProvided stayed false). Firing the cold
    // "CS didn't get one from product" line here would flatly contradict a
    // note the player delivered and Priya's own thread acknowledged, so this
    // middle beat states what actually happened: a note arrived but needed
    // cleanup before CS could use it. Attempt-level, matching the obligation
    // engine's own csTemplateAttemptedAtMinutes gate (dmContacts.ts /
    // obligations.ts), so system voice and Priya's thread agree. No mood
    // penalty: the player engaged and delivered something usable-with-work,
    // milder than the cold path's overwhelmed/frustrated, and there is no
    // "mildly strained" Priya mood to set truthfully.
    id: "resolution-partial",
    day: 1,
    triggerTimeMinutes: 660, // 11:00 AM
    eventType: "chattr_message",
    agentId: "system",
    channel: "general",
    content:
      "**Resolution update.** Engineering shipped a fix for the Apple Pay webhook. Checkout success rate is back at baseline. The customer-facing note you sent needed some cleanup before it was usable, so CS tightened it up on their end to keep the queue moving. Total incident duration: ~2 hours.",
    facts: [
      "Fix shipped, checkout success rate back at baseline",
      "The customer-facing note you sent needed cleanup, so CS tightened it before using it",
      "Total incident duration ~2 hours",
    ],
    condition: (state) => !state.csTemplateProvided && state.csTemplateAttemptedAtMinutes !== null,
  },
  {
    // COLD variant: the player never attempted a customer-facing note at all
    // (csTemplateAttemptedAtMinutes still null). Only here is "CS wrote their
    // own holding message since they didn't get one from product" actually
    // true. Gated on the attempt-level flag (NOT merely !csTemplateProvided)
    // so a delivered-but-weak note routes to the partial beat above instead of
    // being falsely narrated as "no note from product."
    id: "resolution-cold",
    day: 1,
    triggerTimeMinutes: 660, // 11:00 AM
    eventType: "chattr_message",
    agentId: "system",
    channel: "general",
    content:
      "**Resolution update.** Engineering shipped a fix for the Apple Pay webhook. Checkout success rate is back at baseline. CS wrote their own holding message for customers since they didn't get one from product. Total incident duration: ~2 hours.",
    facts: ["Fix shipped, checkout success rate back at baseline", "CS had to write their own customer-facing message", "Total incident duration ~2 hours"],
    condition: (state) => !state.csTemplateProvided && state.csTemplateAttemptedAtMinutes === null,
    applyEffect: () => ({ priyaMood: "overwhelmed", rajMood: "frustrated" }),
  },
  {
    id: "postmortem-prompt",
    day: 1,
    triggerTimeMinutes: 930, // 3:30 PM: after Derek's afternoon check-in, with a quiet stretch before it
    eventType: "postmortem_prompt",
    agentId: "system",
    channel: "incidents",
    content:
      "Write a short incident postmortem: what happened, what you did, and what you'd do differently. This closes out Day 1 and will be scored.",
    requiresResponse: true,
  },
  {
    id: "derek-postmortem-nudge",
    day: 1,
    triggerTimeMinutes: 950, // 3:50 PM: 20 min after the prompt, matching derek-followup's own pattern
    eventType: "chattr_message",
    agentId: "derek",
    channel: "dm_derek",
    content: "Need the postmortem in #incidents before EOD.",
    condition: (state) => !state.postmortemSubmitted,
  },
];
