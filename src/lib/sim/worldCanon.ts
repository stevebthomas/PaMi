import type { AssigneeId } from "./types";
import {
  DEGRADATION_STARTED_AT,
  INCIDENT_DECLARED_AT,
  RESOLUTION_ANNOUNCED_AT,
  FIX_LAND_MINUTES,
  RECOVERY_RAMP_MINUTES,
} from "./incidentTimeline";

/**
 * ============================================================================
 * WORLD CANON: the single home for load-bearing facts about BazaarLoop.
 * ============================================================================
 *
 * WHY THIS EXISTS: tonight's class of bug is content built without checking
 * against facts already established elsewhere. `incidentTimeline.ts` fixed
 * that for TIMING (when did X happen). This file fixes it for WORLD SCALE and
 * SCOPE: does a new number, character, or claim fit the company's real size,
 * team, and the player's actual role? Checkout volume ballooned to 40-60k/day
 * precisely because there was nothing to check it against.
 *
 * THE RULE: any new numeric claim about the company, any new character, or any
 * assumption about role/scope MUST be checked against this file first. If a
 * fact belongs to the world (how big the company is, who is on the squad, what
 * the player owns, how much traffic checkout sees), it lives HERE and everyone
 * else imports it. If it is a TIMING fact (when the fix lands, when the
 * incident was declared), it lives in `incidentTimeline.ts` and this file
 * imports it (see the INCIDENT section) rather than keeping a second copy.
 *
 * Division of labour with pulseMetrics.ts: canon holds the raw world numbers
 * (baseline rate, Apple Pay share, ticket-filing rate, the funnel conversion
 * rates, and the derived attempt volume). pulseMetrics builds the TIME-AWARE
 * curves (severity, recovery, cumulative counters, the 7-day chart) on top of
 * them. pulseMetrics must not define its own copy of a canon scale number.
 */

/* ==========================================================================
 * COMPANY
 * ========================================================================== */

/** Canonical spelling is one word, "BazaarLoop" (matches onboarding copy,
 * day1-scenario.ts, and every persona prompt). Not "Bazaar Loop". */
export const COMPANY = {
  name: "BazaarLoop",
  /** From WelcomeScreen onboarding copy: a marketplace for secondhand goods,
   * an Etsy/eBay mix, built for a younger, mobile-first audience. The
   * mobile-first framing is load-bearing for APPLE_PAY_SHARE below. */
  description:
    "A marketplace where people buy and sell secondhand goods (an Etsy/eBay mix) built for a younger, mobile-first audience.",
  /** Funding stage. A Series B/C consumer marketplace is the size that makes
   * a 5-person squad and a VP reviewing incidents over DM believable, and is
   * the sanity check that killed the old 40-60k/day checkout figure. */
  stage: "Series B/C",
  /** Canonical headcount: ~200 employees, realistically anywhere in 150-300.
   * Set to 200 to MATCH the already-established figure in Raj's persona prompt
   * (prompts.ts: "BazaarLoop ... ~200 employees") rather than introduce a
   * competing number, which is the whole point of this file. Used to keep
   * future org/scale claims (team sizes, ticket volumes, GMV) proportionate. */
  employees: 200,
  employeesRange: [150, 300] as const,
} as const;

/* ==========================================================================
 * PLAYER ROLE
 * ========================================================================== */

/** The player is PM for Buyer Experience. Scope is search THROUGH checkout,
 * not checkout alone (WelcomeScreen: "Everything from search to checkout is
 * your surface area"). This is why Pulse carries a search->cart funnel metric
 * and not just checkout numbers: browse and search are inside the player's
 * surface too. */
export const PLAYER_ROLE = {
  title: "Product Manager, Buyer Experience",
  /** Ordered funnel stages the player owns, top to bottom. */
  scope: ["search", "browse", "cart", "checkout"] as const,
  scopeSummary: "search through checkout",
} as const;

/* ==========================================================================
 * RAJ'S ENGINEERING SQUAD: exactly five
 * ========================================================================== */

/** The five, and only five, engineers on Raj's squad. Raj's persona prompt
 * establishes "You manage a squad of 5 engineers." Any new engineer, or any
 * claim about who is working on what, is checked against this list. These ids
 * are a subset of AssigneeId; Jordan and Chen are additionally DM-capable
 * (DmContactId), the other three are Office-only flavor with no dialogue. */
export type EngineerId = Extract<AssigneeId, "jordan" | "chen" | "marcus" | "ines" | "theo">;

export interface Engineer {
  /** Same id as the AssigneeId / DM-registry id: the join between an Office
   * card and its DM contact / availability, no name-matching. */
  id: EngineerId;
  name: string;
  hair: string;
  skin: string;
  accent: string;
  /** The engineer's established current work. This is a CANON fact: it must
   * agree with how Raj's persona prompt describes the same engineer. */
  defaultTask: string;
  /** Sim-minute this engineer started their listed default task, for the
   * Office hover timestamp. */
  taskStartMinutes: number;
}

/** Moved here verbatim from OfficeApp.tsx so the squad roster and each
 * engineer's established work live in one canonical place. OfficeApp imports
 * this and renders it unchanged. Each defaultTask matches Raj's persona
 * prompt (prompts.ts) so the Office and the DM personas can never disagree
 * about who is doing what. */
export const ENGINEERS: readonly Engineer[] = [
  {
    id: "jordan",
    name: "Jordan",
    hair: "#5a4a3a",
    skin: "#e0b088",
    accent: "#4f9dd8",
    defaultTask: "Rebuilding the payment method selector UI. Blocked on a design review comment about mobile spacing.",
    taskStartMinutes: 525, // 8:45 AM
  },
  {
    id: "chen",
    name: "Chen",
    hair: "#2a2a2a",
    skin: "#f0cba0",
    accent: "#e0556f",
    defaultTask: "Wiring address validation into checkout. Chasing a silent failure on international addresses.",
    taskStartMinutes: 520, // 8:40 AM
  },
  {
    id: "marcus",
    name: "Marcus",
    hair: "#2f2f2f",
    skin: "#c9986a",
    accent: "#3f8f6f",
    // Verbatim from Raj's persona prompt (prompts.ts ~line 60): "Marcus is
    // hardening the seller payout pipeline that shipped last week, chasing a
    // rare double-payout edge case for sellers with multiple bank accounts on
    // file." The full "multiple bank accounts on file" detail is the canonical
    // form; OfficeApp previously showed a truncated version.
    defaultTask:
      "Hardening the seller payout pipeline that shipped last week. Chasing a rare double-payout edge case for sellers with multiple bank accounts on file.",
    taskStartMinutes: 510, // 8:30 AM
  },
  {
    id: "ines",
    name: "Ines",
    hair: "#7a4a2a",
    skin: "#e0b58c",
    accent: "#c75146",
    defaultTask: "On this week's on-call rotation, patching a memory leak in search indexing that's causing nightly restarts.",
    taskStartMinutes: 480, // 8:00 AM: on-call, in early
  },
  {
    id: "theo",
    name: "Theo",
    hair: "#c9a227",
    skin: "#f2d3a2",
    accent: "#6a8caf",
    defaultTask: "First solo ticket: a 'save for later' button on the wishlist page. Raj is reviewing his PRs closely.",
    taskStartMinutes: 530, // 8:50 AM
  },
] as const;

/* ==========================================================================
 * SCALE: checkout volume, Apple Pay share, funnel, support filing rate
 * ==========================================================================
 *
 * Every number in this section carries a one-line justification. The whole
 * point is that the chain below is worked explicitly, so no one can reintroduce
 * a 40-60k/day checkout figure without it visibly failing to reconcile with
 * Priya's "14 tickets in the last hour" and Raj's "3% of Apple Pay attempts".
 */

/** Overall (all-payment-methods) checkout success rate at full health. */
export const BASELINE_RATE = 99.7;

/** Apple Pay's share of all checkout attempts. Raised to 0.35 (from 0.28):
 * BazaarLoop is explicitly "younger, mobile-first" (COMPANY.description), so
 * iOS / Apple Pay skews high. Picking the top of the realistic band also pulls
 * the implied total attempt volume DOWN (see the chain below), which is the
 * direction we want. Only Apple Pay carries the incident; card and Google Pay
 * hold at baseline. */
export const APPLE_PAY_SHARE = 0.35;

/** The incident-caused Apple Pay failure rate, in percentage POINTS, at full
 * degradation. This IS Raj's scripted fact (raj-diagnosis, 9:20 AM: "Stripe
 * webhook for Apple Pay is returning 500s on ~3% of attempts"). FIXED: do not
 * change. Everything a player can read is built off it so nothing contradicts
 * him. */
export const APPLE_PAY_INCIDENT_FAILURE_POINTS = 3.0;

/** Overall degraded success rate, DERIVED so it reconciles with Raj's 3%
 * instead of being set independently. If only Apple Pay fails, and it is
 * APPLE_PAY_SHARE of traffic dropping APPLE_PAY_INCIDENT_FAILURE_POINTS points,
 * the overall rate can only fall by share x points:
 *   99.7 - 0.35 * 3.0 = 99.7 - 1.05 = 98.65.
 * The dramatic number (Apple Pay's own ~96.7%) lives on the breakdown card;
 * the OVERALL dip is deliberately modest because Apple Pay is a minority of
 * traffic. */
export const DEGRADED_RATE = BASELINE_RATE - APPLE_PAY_SHARE * APPLE_PAY_INCIDENT_FAILURE_POINTS;

/** Priya's scripted escalation fact (priya-incidents-escalation, 9:15 AM: "14
 * tickets in the last hour about failed payments. All Apple Pay."). FIXED: do
 * not change. It is the anchor the whole volume chain is reverse-derived from. */
export const SUPPORT_TICKETS_PER_HOUR_AT_ESCALATION = 14;

/** Fraction of buyers whose Apple Pay checkout hard-fails during the incident
 * who file a support ticket within the hour. Raised to 0.50 (from a generic
 * 0.25 support-funnel rule of thumb): this is not a soft degradation, it is a
 * clean payment DECLINE where the buyer literally cannot complete a purchase
 * they were trying to make, so the contact rate is far higher than an average
 * ticket funnel. Picked at the high-but-plausible end deliberately, because a
 * HIGHER filing rate means FEWER unseen failures behind each ticket, which
 * pulls the implied attempt volume DOWN toward a size that fits a Series B/C
 * startup. See the KNOWN LIMITATION note under ATTEMPT_VOLUME_PER_MINUTE. */
export const TICKET_FILING_RATE = 0.5;

/**
 * THE checkout-attempt volume, reverse-derived from Priya's 14 tickets/hour so
 * a player can never find two numbers that disagree. Work the chain explicitly:
 *
 *   14 tickets/hr / 0.50 filing rate       = 28 failed Apple Pay checkouts/hr
 *   28 / 0.03  (Apple Pay failure rate)    = ~933 Apple Pay attempts/hr
 *   933 / 0.35 (Apple Pay share)           = ~2,667 total checkout attempts/hr
 *   2,667 / 60                             = ~44.4 attempts/minute
 *
 * At a flat business-day rate that is ~2,667/hr and, across the 9.5-hour
 * business day (see pulseMetrics' WEEKLY_ATTEMPTS), ~25,300 attempts/day. That
 * is well out of the old ballooned 40-60k/day band and makes 14 tickets/hr a
 * genuine, visible spike (14 tickets against ~2,667 checkouts and ~28 real
 * failures that hour, versus a normal baseline near zero).
 *
 * KNOWN LIMITATION (flagged, not silently papered over): the spec target was
 * "low thousands per day", but that is arithmetically UNREACHABLE while keeping
 * BOTH Priya's 14 tickets/hr AND Raj's 3% Apple Pay failure. Even at a 100%
 * filing rate (every affected buyer files) the floor is 14 / 1.0 / 0.03 / 0.35
 * = ~1,333 attempts/hr = ~12,700/day. Getting to genuine low-thousands would
 * require lowering Priya's 14 (to ~2-3 tickets/hr) or dropping the Apple-Pay
 * reconciliation, both of which the spec forbids. So 0.50 filing + 0.35 Apple
 * Pay share is the strongest HONEST reduction: ~25k/day, down from ~63k, is as
 * low as the fixed narrative facts allow without inventing an implausible 100%
 * filing rate.
 */
export const ATTEMPT_VOLUME_PER_MINUTE =
  SUPPORT_TICKETS_PER_HOUR_AT_ESCALATION /
  TICKET_FILING_RATE /
  (APPLE_PAY_INCIDENT_FAILURE_POINTS / 100) /
  APPLE_PAY_SHARE /
  60;

/* --- Funnel conversion rates (the player owns search through checkout) --- */

/** Share of searches that end in an add-to-cart. A browse-heavy marketplace
 * has a low search->cart rate: lots of looking, little buying. 12% is a
 * standard mid-funnel figure. The incident does NOT touch this stage (search
 * and cart don't depend on the Apple Pay webhook), so it holds flat all day. */
export const SEARCH_TO_CART_RATE = 0.12;

/** Share of carts that go on to START a checkout attempt (the rest abandon).
 * ~35% cart abandonment => 65% reach checkout. This is the stage that connects
 * the funnel to ATTEMPT_VOLUME: searches -> carts -> checkout attempts. A
 * started checkout then either completes or fails per the live success curve,
 * which is where the incident shows up in the cart->completed metric. */
export const CART_TO_CHECKOUT_START_RATE = 0.65;

/** Searches per minute, DERIVED from the same anchor so the funnel and the
 * checkout counters share one model rather than being picked independently:
 *   attempts/min = searches/min * SEARCH_TO_CART_RATE * CART_TO_CHECKOUT_START_RATE
 * so searches/min = attempts/min / (0.12 * 0.65) ~= 44.4 / 0.078 ~= 569/min. */
export const SEARCHES_PER_MINUTE =
  ATTEMPT_VOLUME_PER_MINUTE / (SEARCH_TO_CART_RATE * CART_TO_CHECKOUT_START_RATE);

/* ==========================================================================
 * INCIDENT: world facts (timing facts are imported from incidentTimeline)
 * ==========================================================================
 *
 * The WORLD facts of the incident live here; the TIMING facts live in
 * incidentTimeline.ts and are re-exported below rather than duplicated, so the
 * two files can never drift.
 */
export const INCIDENT = {
  /** Root cause: a Stripe webhook for Apple Pay returning 500s on ~3% of Apple
   * Pay checkout attempts (Raj, raj-diagnosis 9:20 AM). Card and Google Pay
   * unaffected. */
  rootCause: "Stripe webhook for Apple Pay returning 500s on ~3% of Apple Pay checkout attempts",
  applePayFailurePoints: APPLE_PAY_INCIDENT_FAILURE_POINTS,
  /** Priya's escalation: 14 support tickets in the hour before 9:15, all Apple
   * Pay (priya-incidents-escalation). */
  ticketsInHourBeforeEscalation: SUPPORT_TICKETS_PER_HOUR_AT_ESCALATION,
  /** Trigger: last week's seller payout-speed update is what a rollback would
   * revert (Raj's tradeoff offer). This is also the pipeline Marcus is
   * hardening (see ENGINEERS), which is why the two facts must agree. */
  triggerChange: "last week's seller payout-speed update",
  /** Fix durations, imported from incidentTimeline (the single timing source):
   * rollback ~10 min, patch-forward ~30 min. Held here only as a convenience
   * re-export so callers reaching for "the world facts of the incident" find
   * them, not as a second definition. */
  rollbackFixMinutes: FIX_LAND_MINUTES.rollback,
  patchForwardFixMinutes: FIX_LAND_MINUTES["patch-forward"],
} as const;

/* ==========================================================================
 * SELLER PAYOUT PIPELINE: the downstream cost of a rollback (Marcus's beat)
 * ==========================================================================
 *
 * A rollback fixes the buyer-side Apple Pay incident fast, but its cost isn't
 * only "sellers wait longer for money" (Priya's read). There's a second,
 * quieter cost that only a diligent player uncovers: Marcus has spent all day
 * hardening the seller payout pipeline that shipped last week, and a rollback
 * reverts that pipeline to its pre-hardening build mid-batch.
 *
 * The canonical numbers and Marcus's grounded facts live in the dependency-free
 * leaf module payoutCanon.ts and are re-exported HERE so canon stays the single
 * public home for them (his DM persona context and the scripted payout beats
 * both read canon). They live in a leaf, rather than inline in this file, only
 * to avoid an initialization cycle with day1-scenario.ts, which needs the
 * numbers too, see payoutCanon.ts's header for the full explanation. NPCs
 * inform on these facts, they never recommend a path. */
export { PAYOUT_PIPELINE, MARCUS_ROLLBACK_CONCERN } from "./payoutCanon";

/** Timing facts re-exported straight from incidentTimeline so canon is a
 * complete one-stop reference without ever redefining a timestamp. */
export {
  DEGRADATION_STARTED_AT,
  INCIDENT_DECLARED_AT,
  RESOLUTION_ANNOUNCED_AT,
  FIX_LAND_MINUTES,
  RECOVERY_RAMP_MINUTES,
};

/* ==========================================================================
 * SAVE-FOR-LATER PRIOR TEST: Maya's ask-gated tradeoff data
 * ==========================================================================
 *
 * Unrelated to the payment incident: this backs Maya's low-stakes
 * design-review question about whether Theo's "save for later" button should
 * show an animated "saved!" confirmation or stay silent/instant. Framed as an
 * OLD experiment on a similar (not identical) save interaction, so the
 * numbers are directional, not a perfect predictor of this exact feature.
 * Maya holds these numbers but never volunteers them, mirroring exactly how
 * Priya holds the ~60-sellers rollback-exposure number: stated only if the
 * player asks about data, numbers, or past tests (see prompts.ts's
 * MAYA_PROMPT). The two variants pull in opposite directions on purpose, so
 * neither reads as the obviously-correct pick. */
export const SAVE_INTERACTION_PRIOR_TEST = {
  /** Animated "saved!" confirmation: more saves, but a small AOV hit. */
  animatedSavesLiftPoints: 12,
  animatedAovDropPoints: 4,
  /** Silent/instant save: better purchase completion, but fewer saves. */
  silentCompletionLiftPoints: 5,
  silentSavesDropPoints: 9,
} as const;
