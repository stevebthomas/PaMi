import { useSimStore, formatSimTime } from "@/store/simStore";
import { formatSimClock } from "@/lib/sim/timeOfDay";
import { DAY_START_MINUTES, DAY_END_MINUTES } from "@/data/day1-scenario";
import {
  INCIDENT_START_MINUTES,
  BASELINE_RATE,
  SAMPLE_STEP_MINUTES,
  WEEKLY_ATTEMPTS,
  rateAt,
  isRecoveringAt,
  failedCheckoutsAt,
  paymentMethodBreakdownAt,
  completedPurchasesSoFar,
  mondayAttemptsSoFar,
  formatFreshness,
  searchToCartRateAt,
  cartToCompletedCheckoutRateAt,
  type RateInputs,
  type PaymentMethodBreakdownRow,
} from "@/lib/sim/pulseMetrics";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RateSparkline } from "../charts/RateSparkline";
import { WeeklyAttemptsBarChart } from "../charts/WeeklyAttemptsBarChart";
import { Activity, AlertCircle, AlertTriangle, BarChart3, CheckCircle2, CreditCard, GitBranch, TrendingUp, type LucideIcon } from "lucide-react";

/** Live checkout success-rate stat plus its history so far today: the one
 * real consequence of Feature B's rollback-vs-patch-forward decision.
 * Everything else on this page stays a static preview; this is kept
 * proportionate to what was actually asked for rather than building out
 * full live analytics here. */
function useCheckoutSuccessRate() {
  const day = useSimStore((s) => s.day);
  const firedEventIds = useSimStore((s) => s.firedEventIds);
  const clockMinutes = useSimStore((s) => s.clockMinutes);
  const tradeoffChoice = useSimStore((s) => s.stateBag.tradeoffChoice);
  const tradeoffDecidedAtMinutes = useSimStore((s) => s.stateBag.tradeoffDecidedAtMinutes);

  const dayStart = DAY_START_MINUTES[day] ?? clockMinutes;
  const dayEnd = DAY_END_MINUTES[day] ?? clockMinutes;
  const incidentStartMinutes = firedEventIds.has("priya-incidents-escalation") ? INCIDENT_START_MINUTES : null;
  const inputs: RateInputs = { incidentStartMinutes, tradeoffChoice, tradeoffDecidedAtMinutes };

  const rate = rateAt(clockMinutes, inputs);
  const recovering = isRecoveringAt(clockMinutes, inputs);

  const history: { t: number; rate: number }[] = [];
  for (let t = dayStart; t < clockMinutes; t += SAMPLE_STEP_MINUTES) {
    history.push({ t, rate: rateAt(t, inputs) });
  }
  history.push({ t: clockMinutes, rate });

  return {
    value: `${rate.toFixed(1)}%`,
    recovering,
    history,
    isBaseline: rate === BASELINE_RATE,
    dayStart,
    dayEnd,
    clockMinutes,
    incidentStartMinutes,
    tradeoffDecidedAtMinutes,
    inputs,
  };
}

/** Live "failed checkouts" blast-radius stat: the direct answer to "what's
 * the blast radius," computed off the same incident/tradeoff timeline as
 * the success-rate stat above (see pulseMetrics.ts) rather than a number a
 * player has to invent themselves. Neutral zero state before the incident
 * fires, same principle as the success-rate stat's isBaseline handling. */
function useFailedCheckouts() {
  const firedEventIds = useSimStore((s) => s.firedEventIds);
  const clockMinutes = useSimStore((s) => s.clockMinutes);
  const tradeoffChoice = useSimStore((s) => s.stateBag.tradeoffChoice);
  const tradeoffDecidedAtMinutes = useSimStore((s) => s.stateBag.tradeoffDecidedAtMinutes);

  const incidentStartMinutes = firedEventIds.has("priya-incidents-escalation") ? INCIDENT_START_MINUTES : null;
  const inputs: RateInputs = { incidentStartMinutes, tradeoffChoice, tradeoffDecidedAtMinutes };

  const count = failedCheckoutsAt(clockMinutes, inputs);
  const active = incidentStartMinutes !== null;

  return {
    value: active ? count.toLocaleString() : "0",
    caption: active ? `since ${formatSimClock(incidentStartMinutes)}` : "no active incident",
  };
}

/** 25330 -> "25.3k". WEEKLY_ATTEMPTS runs in the tens of thousands (see
 * worldCanon.ts's ATTEMPT_VOLUME_PER_MINUTE), so counts show a compact form
 * instead of a long comma-separated string in tight spaces. */
function formatAttemptCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

/** Semantic tones -> token text colors. Accent green is spent only on genuine
 * success/progress states (per DESIGN.md); volume figures stay neutral. */
type Tone = "green" | "amber" | "red" | "neutral";
const toneText: Record<Tone, string> = {
  green: "text-accent-green",
  amber: "text-status-pending",
  red: "text-status-failed",
  neutral: "text-text-primary",
};
const toneBadge: Record<Tone, string> = {
  green: "bg-accent-green/10 text-accent-green",
  amber: "bg-status-pending/10 text-status-pending",
  red: "bg-status-failed/10 text-status-failed",
  neutral: "bg-muted text-text-secondary",
};
// Semantic top-edge: a 2px colored top border that carries the SAME tone the
// card already computes. Neutral tiles get no colored edge (empty string) — the
// plain hairline stays — so green/red is spent only where the metric is
// actually signaling, per DESIGN.md. Rendered alongside the base rounded border
// so the corners follow the card radius (no square poke).
const toneEdge: Record<Tone, string> = {
  green: "border-t-2 border-t-accent-green",
  amber: "border-t-2 border-t-status-pending",
  red: "border-t-2 border-t-status-failed",
  neutral: "",
};

/** Compact metric tile for progressively-disclosed secondary stats. */
function StatTile({
  label,
  value,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: Tone;
}) {
  return (
    <div className={cn("rounded-[var(--radius-control)] border border-border-hairline bg-surface p-3", toneEdge[tone])}>
      <div className="text-[11px] leading-snug text-text-secondary">{label}</div>
      <div className={cn("mt-1.5 text-xl leading-none font-semibold tabular-nums", toneText[tone])}>{value}</div>
      {caption && <div className="mt-1.5 font-mono text-[10px] tabular-nums text-text-secondary">{caption}</div>}
    </div>
  );
}

/** Per-payment-method checkout breakdown: the rows that make the incident
 * legible: Apple Pay visibly carries the damage (drops to ~96.7%, matching
 * Raj's "~3% of attempts" 500ing) while Card and Google Pay hold at baseline,
 * matching Priya's "All Apple Pay." Attempts-per-method are today's live volume
 * split by each method's share, so this refreshes on the same cadence as
 * everything else. */
function PaymentMethodBreakdown({ rows, freshness }: { rows: PaymentMethodBreakdownRow[]; freshness: string }) {
  const clockMinutes = useSimStore((s) => s.clockMinutes);
  const totalToday = mondayAttemptsSoFar(clockMinutes);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-[11px] text-text-secondary">Success by payment method, today</div>
        <div className="font-mono text-[10px] tabular-nums text-text-secondary">{freshness}</div>
      </div>
      <div className="flex flex-col divide-y divide-border-hairline">
        {rows.map((r) => {
          const attempts = Math.round(r.share * totalToday);
          const degraded = r.successRate < BASELINE_RATE - 0.05;
          // No attempts yet today means the rate curve's number isn't backed by
          // real volume: show a neutral dash instead of asserting a rate over
          // zero data (QA finding #13: "Apple Pay · 0 attempts · 98.8%" read as
          // a fabricated stat).
          const hasAttempts = attempts > 0;
          return (
            <div key={r.method} className="flex items-center gap-3 py-2 text-[13px]">
              <div className="w-20 shrink-0 text-text-primary">{r.method}</div>
              <div className="flex-1 font-mono text-[11px] tabular-nums text-text-secondary">
                {formatAttemptCount(attempts)} attempts
              </div>
              <div className={cn("tabular-nums", hasAttempts && degraded ? "text-status-failed" : "text-accent-green")}>
                {hasAttempts ? `${r.successRate.toFixed(1)}%` : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type HeroState = "healthy" | "elevated" | "recovering" | "incident";
type StatusBadge = { label: string; tone: Tone; Icon: LucideIcon };

/** Single computed status chip for the checkout-rate card.
 *
 * Two regimes:
 *  - BEFORE the escalation fires (incidentStartMinutes null): the overnight
 *    Apple Pay degradation is already quietly underway, so the rate opens below
 *    baseline. That is NOT a declared incident (red is reserved for a real
 *    declared failure, per DESIGN.md), so it reads as an amber "Elevated
 *    failures" heads-up. Only a genuinely at-baseline rate here shows no chip.
 *  - AFTER escalation fires: gated on the SAME trigger the failed-checkouts card
 *    uses, so this badge and that card can never disagree about whether an
 *    incident is live. Precedence: fully recovered/resolved beats "recovering"
 *    beats "active". isBaseline/resolutionFired is checked first because
 *    isRecoveringAt's window ends once the curve is back at baseline, and a
 *    plain fallback to "Incident active" after that window would wrongly
 *    re-declare the incident live. */
function checkoutStatusBadge(
  incidentStartMinutes: number | null,
  recovering: boolean,
  isBaseline: boolean,
  resolutionFired: boolean,
): StatusBadge | null {
  if (incidentStartMinutes === null) {
    // Pre-escalation: amber heads-up while the overnight degradation shows,
    // nothing once the rate is genuinely at baseline.
    return isBaseline ? null : { label: "Elevated failures", tone: "amber", Icon: AlertCircle };
  }
  if (isBaseline || resolutionFired) return { label: "Back to baseline", tone: "green", Icon: CheckCircle2 };
  if (recovering) return { label: "Recovering", tone: "amber", Icon: TrendingUp };
  return { label: "Incident active", tone: "red", Icon: AlertTriangle };
}

export function PulseMock() {
  const {
    value: successRate,
    recovering,
    history,
    isBaseline,
    dayStart,
    dayEnd,
    clockMinutes,
    incidentStartMinutes,
    tradeoffDecidedAtMinutes,
    inputs,
  } = useCheckoutSuccessRate();
  const { value: failedCheckouts, caption: failedCheckoutsCaption } = useFailedCheckouts();
  const resolutionFired = useSimStore((s) => s.firedEventIds.has("resolution-good") || s.firedEventIds.has("resolution-cold"));

  const statusBadge = checkoutStatusBadge(incidentStartMinutes, recovering, isBaseline, resolutionFired);

  // Hero state drives the big-number color and the sparkline line color. Per
  // the DESIGN.md brief for this surface: accent green reads for both healthy
  // AND recovering (recovery is "trending back to success"), status-red only
  // while the incident is actively DECLARED and degrading. The overnight
  // degradation that is already underway at login (before the 9:15 escalation
  // fires) is a real-but-undeclared dip: it reads status-amber "elevated," never
  // green (it is not fully healthy) and never red (nothing is declared yet). The
  // distinct "recovering vs resolved" nuance is not lost — it is carried by the
  // status badge, which is where status-amber (pending/warning) earns its place.
  const incidentActive = incidentStartMinutes !== null;
  const resolved = isBaseline || resolutionFired;
  const heroState: HeroState = incidentActive
    ? resolved
      ? "healthy"
      : recovering
        ? "recovering"
        : "incident"
    : isBaseline
      ? "healthy"
      : "elevated";
  const heroTone: Tone = heroState === "incident" ? "red" : heroState === "elevated" ? "amber" : "green";
  const sparklineColorVar =
    heroState === "incident"
      ? "--color-status-failed"
      : heroState === "elevated"
        ? "--color-status-pending"
        : "--color-accent-green";
  // Status-tone background for the live "pulse" dot, so it tracks the hero tone
  // (red incident / amber elevated / green healthy) instead of only red-vs-green.
  const heroDotBg = heroTone === "red" ? "bg-status-failed" : heroTone === "amber" ? "bg-status-pending" : "bg-accent-green";
  // The hero always carries the top-edge in its computed status tone (red while
  // the incident is degrading, accent-green otherwise) — it is the primary
  // metric, so its edge is never neutral.
  const heroEdge = toneEdge[heroTone];

  // Both derived from the SAME model/inputs as the success-rate stat, floored
  // to the refresh cadence for a believable "data as of" stamp.
  const freshness = formatFreshness(clockMinutes);
  const completedToday = completedPurchasesSoFar(clockMinutes, inputs).toLocaleString();
  const breakdown = paymentMethodBreakdownAt(clockMinutes, inputs);

  // Funnel metrics for the player's real scope (search through checkout). Both
  // from the SAME model as the stats above: search -> cart holds flat (upstream
  // of the Apple Pay webhook), while cart -> completed checkout folds in the
  // live success rate so it dips with the incident and recovers with the fix.
  const searchToCart = `${searchToCartRateAt().toFixed(1)}%`;
  const cartToCheckout = `${cartToCompletedCheckoutRateAt(clockMinutes, inputs).toFixed(1)}%`;

  const weeklyData = [
    ...WEEKLY_ATTEMPTS.map((d) => ({ label: d.label, value: d.count })),
    { label: "Mon*", value: mondayAttemptsSoFar(clockMinutes), muted: true },
  ];

  return (
    <div className="@container h-full w-full overflow-y-auto bg-canvas p-4 text-text-primary">
      {/* Primary metric: checkout success rate leads, sparkline sits with it. */}
      <section className={cn("mb-4 rounded-[var(--radius-card)] border border-border-hairline bg-surface p-4", heroEdge)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-text-secondary">
              <span className="relative flex h-1.5 w-1.5">
                <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", heroDotBg)} />
                <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", heroDotBg)} />
              </span>
              Checkout success rate
            </div>
            <div className={cn("mt-2 text-5xl leading-none font-semibold tracking-tight tabular-nums", toneText[heroTone])}>
              {successRate}
            </div>
            <div className="mt-2 font-mono text-[11px] tabular-nums text-text-secondary">{freshness}</div>
          </div>
          {statusBadge && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                toneBadge[statusBadge.tone],
              )}
            >
              <statusBadge.Icon className="size-3.5" aria-hidden />
              {statusBadge.label}
            </span>
          )}
        </div>

        <div className="mt-4">
          <RateSparkline
            history={history}
            dayStart={dayStart}
            dayEnd={dayEnd}
            incidentStartMinutes={incidentStartMinutes}
            tradeoffDecidedAtMinutes={tradeoffDecidedAtMinutes}
            clockMinutes={clockMinutes}
            baselineRate={BASELINE_RATE}
            colorVar={sparklineColorVar}
            formatTime={formatSimTime}
          />
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-text-secondary">
          <Activity className="size-3.5" aria-hidden />
          Updates live as the incident unfolds.
        </p>
      </section>

      {/* Secondary data, progressively disclosed. Payment methods (the incident
          blast radius) opens by default; the rest stays one click away. */}
      <div className="rounded-[var(--radius-card)] border border-border-hairline bg-surface px-4">
        <Accordion multiple defaultValue={["payments"]}>
          <AccordionItem value="payments">
            <AccordionTrigger>
              <span className="flex items-center gap-2 text-text-primary">
                <CreditCard className="size-4 text-text-secondary" aria-hidden />
                Payment methods
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              <StatTile
                label="Failed checkouts (Apple Pay)"
                value={failedCheckouts}
                caption={failedCheckoutsCaption}
                // Red only while failures are actually accruing (incident live
                // and not yet resolved). No active incident, a 0 count, or a
                // fully-resolved incident all read neutral — per DESIGN.md,
                // status-red is reserved for an actual failure in progress.
                tone={incidentActive && !resolved ? "red" : "neutral"}
              />
              <PaymentMethodBreakdown rows={breakdown} freshness={freshness} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="funnel">
            <AccordionTrigger>
              <span className="flex items-center gap-2 text-text-primary">
                <GitBranch className="size-4 text-text-secondary" aria-hidden />
                Checkout funnel
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3">
                <StatTile label="Search → cart, today" value={searchToCart} caption={freshness} />
                <StatTile label="Cart → completed checkout, today" value={cartToCheckout} caption={freshness} tone={heroTone} />
                <StatTile label="Completed purchases today" value={completedToday} caption={freshness} />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="traffic">
            <AccordionTrigger>
              <span className="flex items-center gap-2 text-text-primary">
                <BarChart3 className="size-4 text-text-secondary" aria-hidden />
                Traffic & support
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4">
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <div className="text-[11px] text-text-secondary">Checkout attempts, last 7 days</div>
                  <div className="font-mono text-[10px] tabular-nums text-text-secondary">{freshness}</div>
                </div>
                <WeeklyAttemptsBarChart data={weeklyData} formatValue={formatAttemptCount} />
                <div className="mt-1 text-[10px] text-text-secondary">* today, in progress</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Avg support response" value="4h 02m" />
                <StatTile label="CSAT (7d)" value="82" />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
