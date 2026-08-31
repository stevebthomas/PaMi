/**
 * ============================================================================
 * SELLER PAYOUT PIPELINE CANON: leaf module, re-exported by worldCanon.
 * ============================================================================
 *
 * These are the load-bearing facts about the seller payout pipeline and what a
 * rollback costs it (Marcus's beat). Conceptually they belong to worldCanon
 * (the single home for world facts), and worldCanon re-exports every name here
 * so the rest of the app keeps importing "from worldCanon" as usual.
 *
 * WHY THIS IS A SEPARATE FILE and not just a section of worldCanon.ts:
 * worldCanon imports incidentTimeline (for the timing re-exports), and
 * incidentTimeline reads day1ScenarioEvents at module-init time. day1-scenario
 * needs these payout numbers in its scripted event text. If day1-scenario
 * imported them from worldCanon, that would close a real initialization cycle
 * (day1-scenario -> worldCanon -> incidentTimeline -> day1-scenario), and
 * whichever module in it evaluated first would read the others half-built and
 * crash. This file has NO imports, so day1-scenario imports the numbers from
 * here directly and the cycle never forms. Everyone else can keep importing
 * them from worldCanon.
 *
 * THE RULE is unchanged: any payout number a player can reach lives HERE once,
 * and every consumer reads it. NPCs inform on these facts, they never
 * recommend a fix path.
 */

export const PAYOUT_PIPELINE = {
  /** Sellers with payouts queued in today's fast-track batch, mid-cycle at the
   * time a rollback would land. This is the SAME ~60 Raj cites in his fallback
   * reasoning (RAJ_FALLBACK_DECISION_PROMPT) and the "in-flight fast-track
   * payouts" Marcus refers to; it lives here so both agree. */
  fastTrackBatchSellers: 60,
  /** How much slower the old (pre-payout-speed-update) cadence is, in days,
   * what affected sellers fall back to under a rollback. Matches Raj's fallback
   * line ("about 2 days slower"). */
  rollbackPayoutDelayDays: 2,
  /** Sellers with MULTIPLE bank accounts on file who show a duplicate payout
   * entry when a rollback catches the fast-track batch mid-cycle, the exact
   * double-payout edge case Marcus was chasing, now actually reproduced. This
   * is the concrete inconsistency the consequence beat surfaces. */
  duplicatePayoutSellersOnRollback: 3,
} as const;

/** The grounded facts Marcus can share if the player asks him what to worry
 * about on payouts before a rollback. Prose, not numbers (the numbers live in
 * PAYOUT_PIPELINE above and are interpolated where a count is needed), so his
 * persona context reads ONE source and can't drift from the scripted beats.
 * Deliberately framed as concerns/mechanics, never as a recommendation: Marcus
 * informs, he does not tell the player to roll back or patch. */
export const MARCUS_ROLLBACK_CONCERN: readonly string[] = [
  "Rolling payment-service back to before last week's payout-speed update also reverts the seller payout pipeline to its pre-hardening build (the build before the work Marcus has been doing all day).",
  `At rollback time there are in-flight fast-track payouts (~${PAYOUT_PIPELINE.fastTrackBatchSellers} sellers, the same batch Priya's tracking) that would be mid-cycle across the version boundary.`,
  "On that old build, mid-cycle records could reproduce the double-payout edge case for sellers with multiple bank accounts on file, which is exactly what Marcus has been chasing.",
  "So before any rollback, Marcus would want to pause or reconcile the fast-track batch first to avoid that.",
];
