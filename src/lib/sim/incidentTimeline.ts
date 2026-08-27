import { day1ScenarioEvents } from "@/data/day1-scenario";
import type { StateBag } from "./types";
import { formatSimClock } from "./timeOfDay";

/**
 * THE single source of truth for "when did X happen" during Day 1's payment
 * incident. Before this module existed, three places each computed their own
 * version of the same underlying timeline: dmContacts.ts's
 * `FIX_DURATION_MINUTES` (engineer ETAs), pulseMetrics.ts's
 * `RECOVERY_LAG_MINUTES` / `ROLLBACK_RECOVERY_MINUTES` /
 * `PATCH_FORWARD_RECOVERY_MINUTES` (the Pulse success-rate curve), and the
 * scripted 11:00 resolution announcement in day1-scenario.ts
 * (`resolution-good` / `resolution-cold`). Those numbers were consistent by
 * coincidence, not by construction, so they could silently drift apart the
 * moment any one of them changed.
 *
 * Every time-aware consumer, Pulse's rate/recovery curve, the engineer DM
 * personas' ETA claims, follow-up pings, ticket timestamps, anything that
 * needs to say "the fix landed at ___" or "we're still degraded", must read
 * its timing facts from `getIncidentTimeline` (or the raw constants below)
 * and must never reconstruct its own copy of this math. If a new caller
 * needs a timestamp this module doesn't expose yet, extend
 * `IncidentTimeline`, don't hardcode a parallel calculation next to it.
 *
 * Pure module: no React, no Zustand, no store import. Callers pass in
 * whatever slice of live state they have (stateBag, firedEventIds,
 * clockMinutes) and get back a plain, fully-derived snapshot.
 */

/** The two fix paths Raj's tradeoff offer presents. Re-exported here (not
 * just read off StateBag directly) so every consumer of this module names
 * the type the same way. */
export type FixPath = NonNullable<StateBag["tradeoffChoice"]>;

/** Minutes from the tradeoff decision to the fix actually landing, per path.
 * Single home for these numbers, they must match Raj's scripted offer in
 * day1-scenario.ts's `raj-tradeoff-offer` ("maybe 10 min" / "more like 30
 * min"), which is player-visible narrative text and therefore can't itself
 * read from a constant, so this is the one place that MUST stay in sync
 * with it by hand. */
export const FIX_LAND_MINUTES: Record<FixPath, number> = {
  rollback: 10,
  "patch-forward": 30,
};

/** Minutes from the fix landing until the checkout success rate is fully
 * back at baseline, the ramp Pulse draws. Chosen so decision-to-fully-
 * recovered matches the old Pulse totals this module replaces
 * (FIX_LAND_MINUTES + this = ~25 min for rollback, ~45 min for
 * patch-forward, the same totals the old RECOVERY_LAG_MINUTES +
 * ROLLBACK_RECOVERY_MINUTES / PATCH_FORWARD_RECOVERY_MINUTES pair in
 * pulseMetrics.ts produced). */
export const RECOVERY_RAMP_MINUTES: Record<FixPath, number> = {
  rollback: 15,
  "patch-forward": 15,
};

/** Sim-clock minute the overnight degradation actually began, anchored to
 * Priya's 8:45 AM heads-up ("a few support tickets overnight", event
 * `priya-heads-up-dm`), this incident was already happening quietly before
 * anyone declared it. Expressed on the same "minutes since midnight" axis
 * the rest of the sim clock uses (8:30 AM day start = 510), so a time from
 * the night before is negative: 11:47 PM the prior night is 23:47 = 1427
 * minutes since that day's midnight, minus 1440 for being a day earlier,
 * giving -13. */
export const DEGRADATION_STARTED_AT = -13;

/** Sim-clock minute the incident was formally declared, Priya's "OK this is
 * escalating" message in #incidents. Pulled from the scenario data itself
 * (not hardcoded twice) so this constant and the scripted event that fires
 * at this time can never drift apart. Evaluates to 555 (9:15 AM). */
export const INCIDENT_DECLARED_AT =
  day1ScenarioEvents.find((e) => e.id === "priya-incidents-escalation")?.triggerTimeMinutes ?? 555;

/** Sim-clock minute the scripted resolution announcement fires (whichever of
 * `resolution-good` / `resolution-cold` actually goes out, both are
 * scripted at the same trigger time, only the wording differs). Pulled from
 * the scenario data, not hardcoded twice. Evaluates to 660 (11:00 AM). */
export const RESOLUTION_ANNOUNCED_AT =
  day1ScenarioEvents.find((e) => e.id === "resolution-good")?.triggerTimeMinutes ?? 660;

/** The narrow slice of live state `getIncidentTimeline` needs. Callers pass
 * whatever they already have in hand; this is intentionally not "the whole
 * store" so this module can't accidentally grow a store dependency. */
export interface IncidentTimelineInputs {
  stateBag: Pick<StateBag, "tradeoffChoice" | "tradeoffDecidedAtMinutes">;
  firedEventIds: ReadonlySet<string>;
  clockMinutes: number;
}

/** Coarse label for where the incident stands right now, derived entirely
 * from the other fields on IncidentTimeline (never an independent flag),
 * useful for UI/persona branching that just wants one word instead of
 * re-deriving it from the individual timestamps. */
export type IncidentPhase = "pre-incident" | "degraded" | "fix-in-progress" | "landed-recovering" | "recovered";

export interface IncidentTimeline {
  degradationStartedAt: number;
  /** null until the escalation event (`priya-incidents-escalation`) has
   * actually fired in this playthrough. */
  incidentDeclaredAt: number | null;
  fixPath: FixPath | null;
  decidedAt: number | null;
  /** decidedAt + FIX_LAND_MINUTES[path]; null if no decision has been made. */
  expectedLandAt: number | null;
  /** expectedLandAt once clockMinutes >= expectedLandAt, else null. This is
   * the ONE timestamp every consumer must quote for "the fix went in",
   * never expectedLandAt, which is only a forecast. */
  landedAt: number | null;
  /** landedAt + RECOVERY_RAMP_MINUTES[path]; null until landed. */
  fullyRecoveredAt: number | null;
  /** RESOLUTION_ANNOUNCED_AT once resolution-good/resolution-cold has fired,
   * else null. */
  resolutionAnnouncedAt: number | null;
  /** Convenience summary of the above, see IncidentPhase. */
  phase: IncidentPhase;
}

/**
 * Derives the full incident timeline from live sim state, at a single
 * instant (clockMinutes). Pure: calling this twice with the same inputs
 * always returns the same (deep-equal) result.
 */
export function getIncidentTimeline(inputs: IncidentTimelineInputs): IncidentTimeline {
  const { stateBag, firedEventIds, clockMinutes } = inputs;
  const { tradeoffChoice: fixPath, tradeoffDecidedAtMinutes: decidedAt } = stateBag;

  const incidentDeclaredAt = firedEventIds.has("priya-incidents-escalation") ? INCIDENT_DECLARED_AT : null;

  const expectedLandAt = fixPath !== null && decidedAt !== null ? decidedAt + FIX_LAND_MINUTES[fixPath] : null;

  const landedAt = expectedLandAt !== null && clockMinutes >= expectedLandAt ? expectedLandAt : null;

  const fullyRecoveredAt = landedAt !== null && fixPath !== null ? landedAt + RECOVERY_RAMP_MINUTES[fixPath] : null;

  const resolutionAnnouncedAt =
    firedEventIds.has("resolution-good") || firedEventIds.has("resolution-cold") ? RESOLUTION_ANNOUNCED_AT : null;

  let phase: IncidentPhase;
  if (incidentDeclaredAt === null) {
    phase = "pre-incident";
  } else if (fixPath === null || decidedAt === null) {
    phase = "degraded";
  } else if (landedAt === null) {
    phase = "fix-in-progress";
  } else if (fullyRecoveredAt !== null && clockMinutes >= fullyRecoveredAt) {
    phase = "recovered";
  } else {
    phase = "landed-recovering";
  }

  return {
    degradationStartedAt: DEGRADATION_STARTED_AT,
    incidentDeclaredAt,
    fixPath,
    decidedAt,
    expectedLandAt,
    landedAt,
    fullyRecoveredAt,
    resolutionAnnouncedAt,
    phase,
  };
}

/**
 * Natural-language relative gap for a duration in minutes, so a stale
 * timeline reads the way a person would say it out loud: "17 min ago" while
 * it's recent, "about 6 hours ago" once it's stale, never "350 min ago".
 * `past` picks the direction ("ago" vs "from now").
 */
function describeGap(minutes: number, past: boolean): string {
  const suffix = past ? "ago" : "from now";
  if (minutes < 60) {
    return `${minutes} min ${suffix}`;
  }
  const hours = Math.round(minutes / 60);
  if (hours === 1) {
    return `about an hour ${suffix}`;
  }
  return `about ${hours} hours ${suffix}`;
}

/**
 * Human-readable "where's the fix" line for prompts/UI, e.g.
 * "landed at 10:30 AM (17 min ago)", "landed at 10:30 AM (about 6 hours ago)",
 * "expected to land around 10:30 AM (8 min from now)", or "no fix decided
 * yet". `clockMinutes` is passed separately from the timeline (rather than
 * reusing an internal field) so a caller can describe the same timeline
 * snapshot at a different instant if it ever needs to (e.g. narrating from a
 * slightly earlier moment).
 */
export function describeFixStatus(t: IncidentTimeline, clockMinutes: number): string {
  if (t.fixPath === null || t.decidedAt === null || t.expectedLandAt === null) {
    return "no fix decided yet";
  }

  if (t.landedAt !== null) {
    const ago = Math.round(clockMinutes - t.landedAt);
    if (ago <= 0) {
      return `landed at ${formatSimClock(t.landedAt)} (just now)`;
    }
    return `landed at ${formatSimClock(t.landedAt)} (${describeGap(ago, true)})`;
  }

  const remaining = Math.round(t.expectedLandAt - clockMinutes);
  if (remaining <= 0) {
    return `expected to land around ${formatSimClock(t.expectedLandAt)} (about now)`;
  }
  return `expected to land around ${formatSimClock(t.expectedLandAt)} (${describeGap(remaining, false)})`;
}
