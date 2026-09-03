import { DAY_END_MINUTES, DAY_START_MINUTES } from "@/data/day1-scenario";
import {
  DEGRADATION_STARTED_AT,
  INCIDENT_DECLARED_AT,
  FIX_LAND_MINUTES,
  RECOVERY_RAMP_MINUTES,
  type FixPath,
} from "./incidentTimeline";
import { formatSimClock } from "./timeOfDay";
import type { StateBag } from "./types";
import {
  BASELINE_RATE,
  APPLE_PAY_SHARE,
  APPLE_PAY_INCIDENT_FAILURE_POINTS,
  DEGRADED_RATE,
  ATTEMPT_VOLUME_PER_MINUTE,
  SEARCH_TO_CART_RATE,
  CART_TO_CHECKOUT_START_RATE,
} from "./worldCanon";

/** Pure, side-effect-free Pulse math, split out of PulseMock.tsx so it can be
 * unit-checked from a plain script and reused server-side later without
 * dragging the component (and its React/Zustand imports) along with it.
 *
 * ONE time-aware model. Every number Pulse can show a player, the live
 * success-rate stat, the sparkline history, the per-payment-method
 * breakdown, the cumulative completed/failed counters, the Monday bar, and
 * the evaluator/persona `dashboardReadingAt` reading, is derived from the
 * single `severityAt` curve below, which is itself keyed entirely on
 * incidentTimeline.ts's constants (DEGRADATION_STARTED_AT,
 * INCIDENT_DECLARED_AT, FIX_LAND_MINUTES, RECOVERY_RAMP_MINUTES). Pulse no
 * longer carries its own copies of the recovery constants
 * (RECOVERY_LAG_MINUTES / ROLLBACK_RECOVERY_MINUTES /
 * PATCH_FORWARD_RECOVERY_MINUTES are gone) so its curve can never drift from
 * the engineer ETAs or the scripted resolution again. */

/** Kept as a named export because dmContacts.ts and simStore.ts both import
 * it to gate `dashboardReadingAt`. It is exactly INCIDENT_DECLARED_AT (555 /
 * 9:15 AM) from the single timeline source, not a second hardcoded copy. */
export const INCIDENT_START_MINUTES = INCIDENT_DECLARED_AT;

const DAY_START = DAY_START_MINUTES[1] ?? 510;
const DAY_END = DAY_END_MINUTES[1] ?? 1080;
const BUSINESS_DAY_MINUTES = DAY_END - DAY_START;

/** Scale facts now live in worldCanon.ts (the single home for load-bearing
 * world numbers) and are re-exported here so existing importers of these names
 * keep working unchanged. pulseMetrics no longer DEFINES any of them; it only
 * builds the time-aware curves on top:
 *   - BASELINE_RATE / DEGRADED_RATE: the overall success-rate band
 *   - APPLE_PAY_SHARE / APPLE_PAY_INCIDENT_FAILURE_POINTS: the Apple Pay
 *     reconciliation (Raj's 3%)
 *   - ATTEMPT_VOLUME_PER_MINUTE: checkout attempts/min, reverse-derived in
 *     canon from Priya's 14 tickets/hr
 *   - SEARCH_TO_CART_RATE / CART_TO_CHECKOUT_START_RATE: funnel conversions */
export { BASELINE_RATE, APPLE_PAY_SHARE, APPLE_PAY_INCIDENT_FAILURE_POINTS, DEGRADED_RATE, ATTEMPT_VOLUME_PER_MINUTE };

/** Sim-minute the overnight degradation reaches its FULL severity. Keyed to
 * INCIDENT_DECLARED_AT (9:15) so it is a timeline constant, not a fresh
 * guess: Priya's 9:05 "volume's still climbing" (worsening) resolves into her
 * 9:15 "OK this is escalating", and Raj measures the full ~3% at 9:20, so the
 * curve is at full degradation across that 9:15-9:20 window. */
const DEGRADATION_FULL_AT = INCIDENT_DECLARED_AT;

/** Severity already present at the START of the visible day (8:30 AM). The
 * incident began quietly at 23:47 the night before (DEGRADATION_STARTED_AT),
 * so the morning does NOT open clean, it opens mildly degraded ("a few
 * support tickets overnight", Priya 8:45) and worsens toward full by 9:15.
 * 0 = baseline, 1 = full degradation; 0.3 is a deliberately mild opening. */
const MORNING_START_SEVERITY = 0.3;

/** Sparkline/stat resampling cadence, also the freshness-stamp granularity:
 * live figures advance in 5-sim-minute steps, not every single minute, so a
 * "data as of H:MM" stamp reads like a real dashboard's refresh interval. */
export const SAMPLE_STEP_MINUTES = 5;

/** The narrow slice of live state every rate/counter function needs. Kept
 * exactly as before because dmContacts.ts and simStore.ts both construct this
 * shape to call `dashboardReadingAt`. `incidentStartMinutes` still scopes the
 * "since incident start" counters, but the success-rate CURVE deliberately
 * ignores it: the degradation is real whether or not the player has read the
 * escalation message (see severityAt). */
export interface RateInputs {
  incidentStartMinutes: number | null;
  tradeoffChoice: StateBag["tradeoffChoice"];
  tradeoffDecidedAtMinutes: number | null;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** The worsening-only severity, 0 (baseline) to 1 (full degradation), before
 * any fix. Three segments, all keyed on timeline constants:
 *   - before the incident even started overnight: 0
 *   - overnight 23:47 -> 8:30 day start: ramps 0 -> MORNING_START_SEVERITY
 *     (slow, mild; this stretch is backstory and isn't drawn on the sparkline)
 *   - morning 8:30 -> 9:15: ramps MORNING_START_SEVERITY -> 1 (the visible
 *     worsening the sparkline shows before the escalation)
 *   - 9:15 onward: full (1) until a fix starts pulling it back. */
function worseningSeverity(t: number): number {
  if (t <= DEGRADATION_STARTED_AT) return 0;
  if (t < DAY_START) {
    return MORNING_START_SEVERITY * ((t - DEGRADATION_STARTED_AT) / (DAY_START - DEGRADATION_STARTED_AT));
  }
  if (t < DEGRADATION_FULL_AT) {
    return MORNING_START_SEVERITY + (1 - MORNING_START_SEVERITY) * ((t - DAY_START) / (DEGRADATION_FULL_AT - DAY_START));
  }
  return 1;
}

/** Recovery multiplier applied on top of the worsening curve, 1 (no recovery
 * yet) down to 0 (fully recovered). Derived straight from the timeline: the
 * fix LANDS at decidedAt + FIX_LAND_MINUTES[path] (nothing improves before
 * then, that landing time IS the old "recovery lag"), then the rate ramps
 * back to baseline over RECOVERY_RAMP_MINUTES[path]. Returns 1 whenever no
 * decision has been made, so an undecided incident stays degraded. */
function recoveryFactor(t: number, choice: FixPath | null, decidedAt: number | null): number {
  if (choice === null || decidedAt === null) return 1;
  const landedAt = decidedAt + FIX_LAND_MINUTES[choice];
  if (t < landedAt) return 1;
  const fullyRecoveredAt = landedAt + RECOVERY_RAMP_MINUTES[choice];
  if (t >= fullyRecoveredAt) return 0;
  return 1 - (t - landedAt) / (fullyRecoveredAt - landedAt);
}

/** THE single severity curve every Pulse number derives from. Worsening
 * curve times recovery factor, so it rises 0 -> 1 through the morning, holds
 * at 1 while degraded, and falls 1 -> 0 across the chosen fix's recovery
 * ramp. Pure function of t plus the tradeoff decision; independent of whether
 * any event has "fired". */
export function severityAt(t: number, inputs: RateInputs): number {
  return clamp01(worseningSeverity(t) * recoveryFactor(t, inputs.tradeoffChoice, inputs.tradeoffDecidedAtMinutes));
}

/** True ONLY when a fix has landed and the rate is actively ramping back to
 * baseline (landedAt <= t < fullyRecoveredAt). Distinct from "the rate is
 * between degraded and baseline", which is ALSO true during the morning
 * worsening ramp before the incident is even declared; a plain band check
 * mislabels that worsening as "Recovering". Keyed on the same timeline
 * constants as recoveryFactor so the label can't disagree with the curve. */
export function isRecoveringAt(t: number, inputs: RateInputs): boolean {
  const { tradeoffChoice: choice, tradeoffDecidedAtMinutes: decidedAt } = inputs;
  if (choice === null || decidedAt === null) return false;
  const landedAt = decidedAt + FIX_LAND_MINUTES[choice];
  const fullyRecoveredAt = landedAt + RECOVERY_RAMP_MINUTES[choice];
  return t >= landedAt && t < fullyRecoveredAt;
}

/** Overall checkout success rate at sim-minute t. Falls from BASELINE_RATE to
 * DEGRADED_RATE as severity rises. This equals the share-weighted blend of the
 * per-method rates below by construction (see the assertion in the check
 * script), so the headline number and the breakdown can never disagree. */
export function successRateAt(t: number, inputs: RateInputs): number {
  return BASELINE_RATE - severityAt(t, inputs) * (BASELINE_RATE - DEGRADED_RATE);
}

/** Back-compat alias: several call sites (and the sparkline history sampler)
 * still say `rateAt`. ONE implementation, two names. */
export const rateAt = successRateAt;

/** Apple Pay's own success rate, which visibly carries the incident: it drops
 * a full APPLE_PAY_INCIDENT_FAILURE_POINTS (Raj's 3 points) at peak, i.e. to
 * ~96.7%. A player reading "Apple Pay 96.7%" sees ~3.3% failing = Raj's ~3%
 * of attempts 500ing plus the ~0.3% everyone fails at baseline. */
export function applePaySuccessRateAt(t: number, inputs: RateInputs): number {
  return BASELINE_RATE - severityAt(t, inputs) * APPLE_PAY_INCIDENT_FAILURE_POINTS;
}

/** Card / Google Pay success rate. They hold at baseline the whole time, which
 * is the point: the damage is Apple-Pay-specific, matching "All Apple Pay"
 * (Priya, 9:15) and the Stripe-Apple-Pay-webhook root cause (Raj, 9:20). No t
 * dependence, they never move; kept as a named function so the breakdown reads
 * off one place per method rather than inlining a bare baseline literal. */
export function cardSuccessRate(): number {
  return BASELINE_RATE;
}

export interface PaymentMethodBreakdownRow {
  method: string;
  /** Share of attempts, 0..1. */
  share: number;
  successRate: number;
}

/** Per-method attempts + success rate for the breakdown card. Apple Pay is
 * degraded per applePaySuccessRateAt; card and Google Pay hold at baseline.
 * Google Pay is split out of "card" purely for display; it behaves
 * identically (baseline) so it visibly holds while Apple Pay drops. */
export function paymentMethodBreakdownAt(t: number, inputs: RateInputs): PaymentMethodBreakdownRow[] {
  const cardRate = cardSuccessRate();
  const GOOGLE_PAY_SHARE = 0.17;
  const CARD_SHARE = 1 - APPLE_PAY_SHARE - GOOGLE_PAY_SHARE;
  return [
    { method: "Apple Pay", share: APPLE_PAY_SHARE, successRate: applePaySuccessRateAt(t, inputs) },
    { method: "Card", share: CARD_SHARE, successRate: cardRate },
    { method: "Google Pay", share: GOOGLE_PAY_SHARE, successRate: cardRate },
  ];
}

/* --------------------------------------------------------------------------
 * Funnel metrics for the player's real scope: search THROUGH checkout, not
 * checkout alone (see PLAYER_ROLE in worldCanon.ts). Both derive from the SAME
 * time-aware model as everything else here: canonical conversion rates from
 * canon, times the live success-rate curve at the one stage the incident
 * actually touches. Search -> cart sits UPSTREAM of the Apple Pay webhook, so
 * it holds flat all day; cart -> completed checkout folds in the live success
 * rate, so it visibly dips while the incident is active and recovers with the
 * fix. That contrast (one stage moves, one doesn't) is the point: it localizes
 * the damage to checkout, matching the payment-method breakdown card.
 * -------------------------------------------------------------------------- */

/** Search -> cart conversion, as a percentage. Constant: the incident lives in
 * the Apple Pay checkout webhook, downstream of add-to-cart, so this stage is
 * untouched by it. Time-agnostic, but takes no arguments so callers read it the
 * same way as the dipping metric below. */
export function searchToCartRateAt(): number {
  return SEARCH_TO_CART_RATE * 100;
}

/** Cart -> completed checkout conversion, as a percentage. Combines the funnel
 * drop-off (CART_TO_CHECKOUT_START_RATE: the share of carts that even start a
 * checkout) with the live OVERALL success rate (the share of started checkouts
 * that complete). The second factor falls with the incident, so this metric
 * visibly dips from ~64.8% at baseline to ~64.1% at full degradation and
 * recovers with the fix, while searchToCartRateAt stays flat. */
export function cartToCompletedCheckoutRateAt(t: number, inputs: RateInputs): number {
  return CART_TO_CHECKOUT_START_RATE * successRateAt(t, inputs);
}

export interface DayAttempts {
  label: string;
  count: number;
  /** Today (Monday) isn't a complete day yet, its count is computed live from
   * mondayAttemptsSoFar rather than being a fixed figure, and it renders with
   * a distinct style so it never reads as a real down day. */
  partial?: boolean;
}

/** ATTEMPT_VOLUME_PER_MINUTE is reverse-derived in worldCanon.ts from Priya's
 * "14 tickets in the last hour, all Apple Pay" anchor (the full chain and its
 * justifications live there). It is imported and re-exported above; this module
 * only consumes it. */

/** Light early-morning volume already on the board when the tracked business
 * day opens at 8:30 AM. A live marketplace is never at a hard zero at 8:30:
 * buyers shopped overnight and first thing in the morning, so the cumulative
 * "today" counters (total attempts, completed purchases, the per-method attempt
 * split, and the Monday bar) OPEN from this value instead of 0. That hard 0 /
 * "—" at login is exactly what read as broken.
 *
 * Sized as OPENING_EQUIV_MINUTES worth of the flat daytime rate: a modest ~5%
 * of the ~25.3k daytime total, enough that no tile reads zero. It is added ON
 * TOP of the daytime accumulation, never carved out of it, so
 * ATTEMPT_VOLUME_PER_MINUTE (the ticket-anchor DAYTIME rate that drives BOTH
 * Priya's 14-tickets/hr reconciliation AND the incident's "14 failed Apple Pay
 * checkouts since incident start" counter, incidentApplePayFailuresAt) is left
 * completely unchanged: those counters integrate the unchanged per-minute rate
 * and are wholly independent of this display-only opening. The 7-day chart's
 * complete days fold in the same opening (see TARGET_COMPLETE_DAY_TOTAL) so
 * every bar is a full day on the same footing and Monday still reaches
 * complete-day parity at 6:00 PM. Early morning is pre-incident, so its volume
 * is all at baseline success. */
const OPENING_EQUIV_MINUTES = 30;
export const OPENING_ATTEMPTS = Math.round(ATTEMPT_VOLUME_PER_MINUTE * OPENING_EQUIV_MINUTES);
const OPENING_COMPLETED = Math.round(OPENING_ATTEMPTS * (BASELINE_RATE / 100));

/** Attempts accumulated in sim time so far today, a pure function of the clock.
 * Opens at OPENING_ATTEMPTS at day start (8:30), growing linearly at
 * ATTEMPT_VOLUME_PER_MINUTE. A flat intraday rate is used deliberately: it makes
 * the 9:15 rate equal the daily average equal the anchor above, so the ticket
 * fact, the live counters, and the 7-day chart's complete days all reconcile to
 * one number. */
export function attemptsPerMinuteAt(t: number): number {
  if (t < DAY_START || t >= DAY_END) return 0;
  return ATTEMPT_VOLUME_PER_MINUTE;
}

export function attemptsSoFar(t: number): number {
  if (t <= DAY_START) return OPENING_ATTEMPTS;
  return OPENING_ATTEMPTS + ATTEMPT_VOLUME_PER_MINUTE * (t - DAY_START);
}

/** Live value for today's (Monday's) bar on the 7-day chart, rounded. This is
 * why the Monday bar reads ~0 at 8:30 and grows as the clock advances,
 * instead of the old fixed "7.4k". */
export function mondayAttemptsSoFar(t: number): number {
  return Math.round(attemptsSoFar(t));
}

const INTEGRATION_STEP_MINUTES = 1;

/** Cumulative completed purchases so far today = integral of attempts x
 * overall success rate from day start to t. Numerically integrated because
 * the rate varies across the morning and recovery. */
export function completedPurchasesSoFar(t: number, inputs: RateInputs): number {
  if (t <= DAY_START) return OPENING_COMPLETED;
  let total = OPENING_COMPLETED;
  for (let m = DAY_START; m < t; m += INTEGRATION_STEP_MINUTES) {
    const dt = Math.min(INTEGRATION_STEP_MINUTES, t - m);
    total += attemptsPerMinuteAt(m) * (successRateAt(m, inputs) / 100) * dt;
  }
  return Math.round(total);
}

/** Cumulative failed checkouts so far today = attempts minus completed. This
 * is TOTAL failures (including the ~0.3% everyone fails at baseline), defined
 * as the residual so the invariant completed + failed == attempts holds
 * exactly by construction. Distinct from the incident-attributable Apple Pay
 * counter below, which the blast-radius card actually shows. */
export function failedCheckoutsSoFar(t: number, inputs: RateInputs): number {
  return Math.round(attemptsSoFar(t)) - completedPurchasesSoFar(t, inputs);
}

/** Cumulative failed Apple Pay checkouts ATTRIBUTABLE TO THE INCIDENT, since
 * incident start, i.e. Apple Pay failures ABOVE baseline. This is precisely
 * what the "Failed checkouts (Apple Pay), since incident start" card claims
 * and what dashboardReadingAt quotes: Apple Pay attempts x the incident-only
 * failure fraction (severity x 3 points), integrated from incidentStart to t.
 * Zero before the incident starts; monotonically non-decreasing (integrand
 * >= 0); plateaus once severity returns to 0 after recovery. */
export function incidentApplePayFailuresAt(atMinutes: number, inputs: RateInputs): number {
  const { incidentStartMinutes } = inputs;
  if (incidentStartMinutes === null || atMinutes <= incidentStartMinutes) return 0;

  const applePayPerMinute = ATTEMPT_VOLUME_PER_MINUTE * APPLE_PAY_SHARE;
  let total = 0;
  for (let m = incidentStartMinutes; m < atMinutes; m += INTEGRATION_STEP_MINUTES) {
    const dt = Math.min(INTEGRATION_STEP_MINUTES, atMinutes - m);
    const incidentFailFraction = (severityAt(m, inputs) * APPLE_PAY_INCIDENT_FAILURE_POINTS) / 100;
    total += applePayPerMinute * incidentFailFraction * dt;
  }
  return Math.round(total);
}

/** Back-compat alias: PulseMock's blast-radius card and dashboardReadingAt
 * still say `failedCheckoutsAt`. Same implementation as
 * incidentApplePayFailuresAt (incident-attributable Apple Pay failures). */
export const failedCheckoutsAt = incidentApplePayFailuresAt;

/** A customer whose Apple Pay checkout fails during this incident doesn't
 * necessarily give up after one try, Raj's own fix touches "retry/idempotency
 * handling", so some counted failures are the same person retrying. 1.5
 * attempts per affected user is a modest, named assumption. */
const AVG_FAILED_ATTEMPTS_PER_AFFECTED_USER = 1.5;

/** Cumulative distinct users hit by the incident's Apple Pay failures, since
 * incident start. Shares incidentApplePayFailuresAt's zero-before-incident,
 * monotonic, and plateau behavior. */
export function affectedUsersAt(atMinutes: number, inputs: RateInputs): number {
  return Math.round(incidentApplePayFailuresAt(atMinutes, inputs) / AVG_FAILED_ATTEMPTS_PER_AFFECTED_USER);
}

/** Freshness: floor a sim-minute to the nearest SAMPLE_STEP_MINUTES so live
 * cards and the Monday bar refresh on a believable cadence, not every minute. */
export function dataAsOfMinutes(t: number): number {
  return Math.floor(t / SAMPLE_STEP_MINUTES) * SAMPLE_STEP_MINUTES;
}

/** "data as of 9:30 AM" style stamp, floored to the refresh cadence. */
export function formatFreshness(t: number): string {
  return `data as of ${formatSimClock(dataAsOfMinutes(t))}`;
}

/** Fixed historical checkout-attempt counts for the SIX complete days ending
 * yesterday (today/Monday is live, see mondayAttemptsSoFar). Day 1 is always
 * narratively a Mon-week regardless of the real calendar, so these are the
 * scenario's own fixed Tue-Sun, not computed from `new Date()`. The relative
 * weekday/weekend SHAPE is hand-set; the MAGNITUDE follows
 * ATTEMPT_VOLUME_PER_MINUTE (the ticket anchor, see worldCanon.ts) via
 * WEEKLY_ATTEMPTS_SCALE, so the chart's complete-day average reproduces the
 * same ~44.4 attempts/minute the live counters use instead of being picked
 * independently. The weights below are relative SHAPE only (weekday vs
 * weekend); their absolute magnitude is overwritten by the scale. */
const BASE_WEEKLY_SHAPE: { label: string; weight: number }[] = [
  { label: "Tue", weight: 1180 },
  { label: "Wed", weight: 1240 },
  { label: "Thu", weight: 1310 },
  { label: "Fri", weight: 1460 },
  { label: "Sat", weight: 890 },
  { label: "Sun", weight: 760 },
];
const BASE_SHAPE_AVG = BASE_WEEKLY_SHAPE.reduce((s, d) => s + d.weight, 0) / BASE_WEEKLY_SHAPE.length;
/** Target complete-day total: the daytime accumulation from the anchor
 * (attempts/min x business-day minutes) PLUS the fixed early-morning opening
 * (OPENING_ATTEMPTS), so a complete day is the full day a live chart would
 * show, not just the 8:30-6:00 tracked window. Folding the same opening in here
 * that attemptsSoFar opens from is what keeps Monday reaching complete-day
 * parity at 6:00 PM (attemptsSoFar(DAY_END) == this) instead of ending a notch
 * above the Tue-Sun bars. The daytime RATE anchor is untouched; the opening is
 * an additive full-day term, not a change to attempts/min. Dividing by the base
 * shape's average day rescales the whole shape so its complete-day average
 * equals that target. */
const TARGET_COMPLETE_DAY_TOTAL = ATTEMPT_VOLUME_PER_MINUTE * BUSINESS_DAY_MINUTES + OPENING_ATTEMPTS;
const WEEKLY_ATTEMPTS_SCALE = TARGET_COMPLETE_DAY_TOTAL / BASE_SHAPE_AVG;

export const WEEKLY_ATTEMPTS: DayAttempts[] = BASE_WEEKLY_SHAPE.map((d) => ({
  label: d.label,
  count: Math.round(d.weight * WEEKLY_ATTEMPTS_SCALE),
}));

/** The Pulse dashboard reading a player would see at a given sim-minute,
 * formatted as one system data-source line for the evaluator and the engineer
 * personas. Unchanged signature and string shape (dmContacts.ts and
 * simStore.ts depend on it): the overall success rate (successRateAt) plus the
 * cumulative incident-attributable failed Apple Pay checkouts
 * (incidentApplePayFailuresAt). Returns null before the incident starts, where
 * there is nothing worth grounding a claim against. */
export function dashboardReadingAt(atMinutes: number, inputs: RateInputs): string | null {
  if (inputs.incidentStartMinutes === null || atMinutes < inputs.incidentStartMinutes) return null;
  const rate = successRateAt(atMinutes, inputs);
  const failed = incidentApplePayFailuresAt(atMinutes, inputs);
  return `checkout success rate ${rate.toFixed(1)}%, failed Apple Pay checkouts since incident start ${failed}`;
}
