import type { AgentId, ChannelId, CommitmentEntry, CommitmentKind } from "./types";

/**
 * Deterministic population of StateBag.commitmentLedger (see CommitmentEntry in
 * types.ts). This module is the ONE place ledger entries are shaped, so every
 * call site stays a one-liner at a real state-transition point.
 *
 * DEPENDENCY DISCIPLINE: this file imports ONLY from ./types. day1-scenario.ts
 * calls into it from a couple of event applyEffects, and day1-scenario sits at
 * the bottom of a real init cycle (worldCanon -> incidentTimeline ->
 * day1-scenario). Pulling in anything heavier here (dmContacts, worldCanon,
 * incidentTimeline) would close that cycle, so the fix-engineer id list is
 * passed in by the caller rather than imported.
 *
 * IDEMPOTENCY: every append is keyed by a STABLE, content-derived id (never
 * makeId()/Date.now()), because advanceClock is re-entrant and an applyEffect
 * can run more than once across +15m jumps and fallback re-runs. Appending an
 * entry whose id already exists is a no-op; settling one that's already settled
 * (or absent) is a no-op. All entries are plain-JSON primitives, so the whole
 * array round-trips through the persistence layer untouched.
 */

/** Stable, deterministic id for a ledger entry so appends dedupe by identity
 * across re-entrant advanceClock calls. Same (kind, agentId, tag) => same id. */
export function commitmentId(kind: CommitmentKind, agentId: AgentId, tag: string): string {
  return `commit-${kind}-${agentId}-${tag}`;
}

/** Append an entry unless one with the same id already exists. Never mutates
 * the input array (returns it unchanged when the entry is already present). */
export function appendCommitment(ledger: CommitmentEntry[], entry: CommitmentEntry): CommitmentEntry[] {
  if (ledger.some((e) => e.id === entry.id)) return ledger;
  return [...ledger, entry];
}

/** Flip an open entry to "settled" by id. No-op (returns the same array) if the
 * id isn't present or is already settled. Never mutates the input array. */
export function settleCommitment(ledger: CommitmentEntry[], id: string): CommitmentEntry[] {
  let changed = false;
  const next = ledger.map((e) => {
    if (e.id === id && e.status !== "settled") {
      changed = true;
      return { ...e, status: "settled" as const };
    }
    return e;
  });
  return changed ? next : ledger;
}

// --- Tag constants: one per Day-1 population point, so the append site and the
// settle site can never drift on the key that ties them together. ---
const FIX_DECISION_TAG = "fix-decision";
const FIX_LANDED_TAG = "fix-landed";
const CS_TEMPLATE_TAG = "cs-template";
const SELLER_COMMS_TAG = "seller-comms";

/**
 * Raj's "decision-acknowledged" entry, born settled: a fix decision, once
 * made, is settled context Raj is now operating under, not something for him to
 * re-acknowledge as news later. Records where it was made so his later
 * references stay consistent (the DM vs. #incidents cross-channel case is the
 * exact bug this fixes). `decidedByRaj` marks the fallback path where the player
 * went quiet and Raj made the call himself.
 */
export function recordFixDecisionAck(
  ledger: CommitmentEntry[],
  opts: {
    choice: "rollback" | "patch-forward";
    channel: ChannelId;
    atSimMinutes: number;
    /** Human phrase for where it was decided, e.g. "your DM with Raj" or "#incidents". */
    where: string;
    decidedByRaj: boolean;
  }
): CommitmentEntry[] {
  const path = opts.choice === "rollback" ? "the rollback" : "the patch-forward fix";
  const summary = opts.decidedByRaj
    ? `Fix decision is settled: Raj went with ${path} himself after the PM went quiet, and looped Derek in.`
    : `Fix decision is settled: going with ${path} (decided in ${opts.where}).`;
  return appendCommitment(ledger, {
    id: commitmentId("decision-acknowledged", "raj", FIX_DECISION_TAG),
    agentId: "raj",
    summary,
    channel: opts.channel,
    atSimMinutes: opts.atSimMinutes,
    kind: "decision-acknowledged",
    status: "settled",
  });
}

/**
 * The assigned fix engineers' open "will report when the fix lands" commitment,
 * one per engineer. Kept open until the fix-landed follow-up DM actually goes
 * out (settleFixEngineerCommitment). `engineerIds` is passed in (see the
 * dependency note above); the caller sources it from DM_CONTACTS.
 */
export function recordFixEngineerCommitments(
  ledger: CommitmentEntry[],
  opts: {
    engineerIds: AgentId[];
    choice: "rollback" | "patch-forward";
    channel: ChannelId;
    atSimMinutes: number;
  }
): CommitmentEntry[] {
  const what = opts.choice === "rollback" ? "the rollback" : "the patch-forward fix";
  return opts.engineerIds.reduce(
    (acc, engineerId) =>
      appendCommitment(acc, {
        id: commitmentId("npc-commitment", engineerId, FIX_LANDED_TAG),
        agentId: engineerId,
        summary: `You're on ${what} and told the player you'd ping them the moment it lands.`,
        channel: opts.channel,
        atSimMinutes: opts.atSimMinutes,
        kind: "npc-commitment",
        status: "open",
      }),
    ledger
  );
}

/** Settle one engineer's fix-landed commitment (when their follow-up ping fires). */
export function settleFixEngineerCommitment(ledger: CommitmentEntry[], engineerId: AgentId): CommitmentEntry[] {
  return settleCommitment(ledger, commitmentId("npc-commitment", engineerId, FIX_LANDED_TAG));
}

/** Priya's open "player owes me a CS message/template" entry, appended when she
 * asks for it (priya-template-request). */
export function recordPlayerOwesCsTemplate(ledger: CommitmentEntry[], atSimMinutes: number): CommitmentEntry[] {
  return appendCommitment(ledger, {
    id: commitmentId("player-owes-npc", "priya", CS_TEMPLATE_TAG),
    agentId: "priya",
    summary: "The player owes you a customer-facing message/template your team can use for the Apple Pay failures.",
    channel: "dm_priya",
    atSimMinutes,
    kind: "player-owes-npc",
    status: "open",
  });
}

/** Settle Priya's CS-template obligation (when a good template is delivered). */
export function settlePlayerOwesCsTemplate(ledger: CommitmentEntry[]): CommitmentEntry[] {
  return settleCommitment(ledger, commitmentId("player-owes-npc", "priya", CS_TEMPLATE_TAG));
}

/** Priya's open "player owes me a seller-facing note" entry (B4), appended when
 * her rollback-only seller-comms ask FIRES (see the "priya-seller-comms-ask"
 * obligation). Follows the CS-template pattern exactly, with its own tag so the
 * append and settle sites can never drift and it never collides with the
 * CS-template entry (both are player-owes-npc / priya). Only ever reached on the
 * rollback path, since that's the only path that fires the ask. */
export function recordPlayerOwesSellerComms(ledger: CommitmentEntry[], atSimMinutes: number): CommitmentEntry[] {
  return appendCommitment(ledger, {
    id: commitmentId("player-owes-npc", "priya", SELLER_COMMS_TAG),
    agentId: "priya",
    summary:
      "The player owes you a seller-facing message explaining the payout delay the rollback imposes on the fast-track batch sellers.",
    channel: "dm_priya",
    atSimMinutes,
    kind: "player-owes-npc",
    status: "open",
  });
}

/** Settle Priya's seller-comms obligation (when the player attempts a
 * seller-facing note, see sellerCommsAttemptedAtMinutes in the store). */
export function settlePlayerOwesSellerComms(ledger: CommitmentEntry[]): CommitmentEntry[] {
  return settleCommitment(ledger, commitmentId("player-owes-npc", "priya", SELLER_COMMS_TAG));
}

// --- DISCUSSED-TOPIC LEDGER (the "we already went over this" record; see the
// "topic-discussed" CommitmentKind in types.ts). One stable tag per substantive
// topic the player can cover with an NPC, so the record site and the query site
// (hasDiscussed) can never drift on the key that ties them together, exactly
// like the commitment tags above. These are the mechanism that lets scripted
// beats and free-form replies tell "the player has already been walked through
// this" apart from "this is the first time," across every channel. Populated at
// the deterministic transition points the store already tracks (e.g. the same
// send-time signal that sets tradeoffEngagedWithRajAtMinutes, the satisfaction
// of priya-heads-up-dm), never from a free-form model reply. ---

/** Raj has already walked the player through the fix options (the
 * rollback-vs-patch-forward tradeoff), in DM or #incidents. Recorded off the
 * same substantive-engagement signal that sets tradeoffEngagedWithRajAtMinutes
 * in the store, so it's true exactly when the player has actually been going
 * back and forth with Raj on the call, independent of whether a definite choice
 * has been classified yet. */
export const DISCUSSED_RAJ_INCIDENT_OPTIONS = "raj-incident-options";

/** Priya has already flagged the checkout / Apple Pay ticket spike directly to
 * the player and they've engaged on it. Recorded when the player satisfies
 * Priya's 8:45 heads-up DM (priya-heads-up-dm), which is a dm_priya reply by
 * construction, so it means a real back-and-forth with her about the spike. */
export const DISCUSSED_PRIYA_TICKET_SPIKE = "priya-ticket-spike";

/**
 * Record that the player has already covered `topic` WITH `agentId` (see the
 * "topic-discussed" CommitmentKind). Born "settled": discussed is a settled
 * fact, not an open obligation. Idempotent by stable, content-derived id
 * (commitmentId("topic-discussed", agentId, topic)), so a re-entrant
 * advanceClock or a re-run detector can't double-append. `summary` is the
 * human-readable line the owning NPC sees in their reply context, phrased as
 * already-known ground ("you've already walked them through X").
 */
export function recordTopicDiscussed(
  ledger: CommitmentEntry[],
  opts: { agentId: AgentId; topic: string; channel: ChannelId; atSimMinutes: number; summary: string }
): CommitmentEntry[] {
  return appendCommitment(ledger, {
    id: commitmentId("topic-discussed", opts.agentId, opts.topic),
    agentId: opts.agentId,
    summary: opts.summary,
    channel: opts.channel,
    atSimMinutes: opts.atSimMinutes,
    kind: "topic-discussed",
    status: "settled",
  });
}

/** True iff `topic` has been recorded as discussed with `agentId`. The read
 * side of recordTopicDiscussed, keyed by the same stable id so the two can't
 * drift. Tolerates an absent/undefined ledger (old sessions, tests) as "not
 * discussed," so every caller stays a one-liner. */
export function hasDiscussed(ledger: CommitmentEntry[] | undefined, agentId: AgentId, topic: string): boolean {
  if (!ledger || ledger.length === 0) return false;
  const id = commitmentId("topic-discussed", agentId, topic);
  return ledger.some((e) => e.id === id);
}
