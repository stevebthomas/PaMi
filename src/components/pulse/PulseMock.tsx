import { useRef, useState, type MouseEvent } from "react";
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

/** Live checkout success-rate stat plus its history so far today — the one
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
  const messages = useSimStore((s) => s.messages);

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

  // Points where the player actually sent a message during the incident —
  // decoration on the sampled line above, not a new data source. The rate is
  // the same rateAt formula the line itself is built from, just evaluated at
  // the exact minute a Pulse reading was snapshotted onto that message (see
  // Message.dashboard in types.ts and pulseMetrics.ts's dashboardReadingAt).
  const messageDots = messages
    .filter((m) => m.senderId === "player" && m.dashboard)
    .map((m) => ({ t: m.sentAtSimMinutes, rate: rateAt(m.sentAtSimMinutes, inputs) }));

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
    messageDots,
    inputs,
  };
}

/** Live "failed checkouts" blast-radius stat — the direct answer to "what's
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

/** Self-built sparkline — proportionate to what was asked (a trend shape,
 * not a charting library) since this is the one place on Pulse where the
 * dip-and-recovery shape actually needs to be visible over time, not just
 * as a single current number.
 *
 * The x-axis domain is the FIXED full-day range (dayStart..dayEnd), not
 * history[0].t..history[last].t — that was a real bug, not just a "flat
 * data looks boring" perception issue: an auto-scaling domain always
 * stretches to fit whatever's been sampled so far, which pins the latest
 * point to the same right-edge pixel on every single render regardless of
 * how much sim-time has actually passed. The line and its end dot never
 * visibly moved as the player advanced the clock. A fixed domain means the
 * dot genuinely travels rightward across the day. */
const SPARKLINE_WIDTH = 280;
const SPARKLINE_HEIGHT = 64;
const SPARKLINE_PAD = 4;
// Below this pixel gap (in the sparkline's own coordinate space), a later
// time marker's label would visibly collide with the previously-kept one —
// dropped rather than stacked, since this chart is only 64px tall.
const SPARKLINE_MARKER_MIN_GAP = 32;

/** Self-built sparkline — proportionate to what was asked (a trend shape,
 * not a charting library) since this is the one place on Pulse where the
 * dip-and-recovery shape actually needs to be visible over time, not just
 * as a single current number.
 *
 * The x-axis domain is the FIXED full-day range (dayStart..dayEnd), not
 * history[0].t..history[last].t — that was a real bug, not just a "flat
 * data looks boring" perception issue: an auto-scaling domain always
 * stretches to fit whatever's been sampled so far, which pins the latest
 * point to the same right-edge pixel on every single render regardless of
 * how much sim-time has actually passed. The line and its end dot never
 * visibly moved as the player advanced the clock. A fixed domain means the
 * dot genuinely travels rightward across the day.
 *
 * Also carries a time-axis row (day start / incident start / recovery /
 * now), a hover tooltip on the sampled points (same pixel tooltip look as
 * WeeklyAttemptsChart's below), and small dots marking the exact minutes
 * the player sent a message during the incident. */
function Sparkline({
  history,
  dayStart,
  dayEnd,
  incidentStartMinutes,
  tradeoffDecidedAtMinutes,
  clockMinutes,
  messageDots,
}: {
  history: { t: number; rate: number }[];
  dayStart: number;
  dayEnd: number;
  incidentStartMinutes: number | null;
  tradeoffDecidedAtMinutes: number | null;
  clockMinutes: number;
  messageDots: { t: number; rate: number }[];
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  if (history.length < 2) return <div className="h-16" />;

  const minRate = Math.min(...history.map((h) => h.rate)) - 0.15;
  const maxRate = BASELINE_RATE + 0.1;
  const tRange = dayEnd - dayStart || 1;

  const xForT = (t: number) => SPARKLINE_PAD + ((t - dayStart) / tRange) * (SPARKLINE_WIDTH - SPARKLINE_PAD * 2);
  const yForRate = (rate: number) =>
    SPARKLINE_HEIGHT - SPARKLINE_PAD - ((rate - minRate) / (maxRate - minRate)) * (SPARKLINE_HEIGHT - SPARKLINE_PAD * 2);

  const points = history.map((h) => `${xForT(h.t).toFixed(1)},${yForRate(h.rate).toFixed(1)}`);
  const lastSample = history[history.length - 1];
  const lastX = xForT(lastSample.t);
  const lastY = yForRate(lastSample.rate);

  // Time markers under the chart: day start, incident start (once the
  // incident's actually fired), the tradeoff recovery point (once decided),
  // and "now." Culled by PRIORITY, not by time order — incident/recovery/now
  // are the narratively load-bearing markers, so a marker only survives if
  // it doesn't collide with an already-kept HIGHER-priority one; day start
  // is lowest priority and is the one that yields when space is tight
  // (previously this culled in time order, which meant day start always won
  // and incident start — the one that actually matters — got dropped
  // whenever it landed close to it). The kept set is then sorted by time
  // for rendering.
  type Marker = { key: string; t: number; caption: string };
  const priorityMarkers: Marker[] = [];
  if (incidentStartMinutes !== null) priorityMarkers.push({ key: "incident", t: incidentStartMinutes, caption: "incident" });
  if (tradeoffDecidedAtMinutes !== null) priorityMarkers.push({ key: "recovery", t: tradeoffDecidedAtMinutes, caption: "fix" });
  priorityMarkers.push({ key: "now", t: clockMinutes, caption: "now" });
  priorityMarkers.push({ key: "start", t: dayStart, caption: "start" });

  const keptMarkers: (Marker & { x: number })[] = [];
  for (const m of priorityMarkers) {
    const x = xForT(m.t);
    const collidesWithKept = keptMarkers.some((k) => Math.abs(k.x - x) < SPARKLINE_MARKER_MIN_GAP);
    if (!collidesWithKept) keptMarkers.push({ ...m, x });
  }
  const markers = [...keptMarkers].sort((a, b) => a.t - b.t);

  function handleMove(e: MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const localX = ((e.clientX - rect.left) / rect.width) * SPARKLINE_WIDTH;
    let nearestIndex = 0;
    let nearestDist = Infinity;
    history.forEach((h, i) => {
      const dist = Math.abs(xForT(h.t) - localX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = i;
      }
    });
    setHoverIndex(nearestIndex);
  }

  const hovered = hoverIndex !== null ? history[hoverIndex] : null;

  return (
    <div>
      <div className="relative">
        {/* preserveAspectRatio="none" is the fix for the misaligned
            crosshair/tooltip. The default ("xMidYMid meet") uniformly scales
            the 280x64 viewBox to fit the rendered box and CENTERS it, so with
            a container wider than 280px the line only occupies a letterboxed
            strip in the middle — but the hover math (clientX->viewBox via the
            full rendered width) and the CSS-percent tooltip/marker overlay
            both assume the viewBox spans the full width. That mismatch is what
            put the highlight dot and tooltip off from the cursor. Forcing
            "none" stretches the viewBox to fill the box exactly, so viewBox-x
            maps linearly across the full width and every overlay lines up.
            Height already equals the viewBox height (h-16 = 64px), so y is
            unscaled; only near-vertical strokes/dots stretch slightly in x,
            an acceptable trade for a decorative sparkline. */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-16 w-full cursor-crosshair"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <polyline points={points.join(" ")} fill="none" stroke="#34c3a3" strokeWidth={2} />
          {messageDots.map((d, i) => (
            <circle key={i} cx={xForT(d.t)} cy={yForRate(d.rate)} r={2.2} fill="#241f33" stroke="#ffffff" strokeWidth={0.75} />
          ))}
          <circle cx={lastX} cy={lastY} r={3} fill="#34c3a3" />
          {hovered && <circle cx={xForT(hovered.t)} cy={yForRate(hovered.rate)} r={3} fill="none" stroke="#241f33" strokeWidth={1} />}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap border-2 border-ink bg-bg-window px-1.5 py-0.5 font-pixel text-[9px] text-ink"
            style={{
              left: `${(xForT(hovered.t) / SPARKLINE_WIDTH) * 100}%`,
              top: `${(yForRate(hovered.rate) / SPARKLINE_HEIGHT) * 100}%`,
            }}
          >
            {formatSimTime(hovered.t)}: {hovered.rate.toFixed(1)}%
          </div>
        )}
      </div>
      <div className="relative h-6 w-full">
        {markers.map((m) => (
          <div
            key={m.key}
            className="absolute -translate-x-1/2 whitespace-nowrap text-center"
            style={{ left: `${(m.x / SPARKLINE_WIDTH) * 100}%` }}
          >
            <div className="text-[8px] text-ink-soft">{formatSimTime(m.t)}</div>
            <div className="text-[7px] italic text-ink-soft">{m.caption}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 25330 -> "25.3k" — WEEKLY_ATTEMPTS runs in the tens of thousands (see
 * worldCanon.ts's ATTEMPT_VOLUME_PER_MINUTE), so the tooltip shows a compact
 * form instead of a long comma-separated string in a small pixel-art popup. */
function formatAttemptCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

/** Bar chart with real numbers behind each bar, weekday labels, and a
 * hover tooltip — sharp-edged pixel-art style (border-2/bg-bg-window,
 * matching Taskbar's own icon tooltip) rather than a soft rounded corporate
 * popup. Today's bar is visually distinguished (lighter fill, dashed top
 * edge) since it's the one incomplete day in the set. */
function WeeklyAttemptsChart() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const clockMinutes = useSimStore((s) => s.clockMinutes);

  // Today's (Monday's) bar is LIVE: the volume accumulated in sim time so
  // far, a pure function of the clock (mondayAttemptsSoFar), so it reads ~0 at
  // 8:30 and grows on the same cadence as the live stat cards — not the old
  // fixed "7.4k". WEEKLY_ATTEMPTS itself now holds only the six complete
  // historical days; Monday is appended here.
  const days = [
    ...WEEKLY_ATTEMPTS,
    { label: "Mon", count: mondayAttemptsSoFar(clockMinutes), partial: true },
  ];
  const maxCount = Math.max(...days.map((d) => d.count), 1);

  return (
    <div className="pixel-border bg-white p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <div className="text-[11px] text-ink-soft">Checkout attempts, last 7 days</div>
        <div className="text-[9px] italic text-ink-soft">{formatFreshness(clockMinutes)}</div>
      </div>
      <div className="flex h-32 items-end gap-2">
        {days.map((d, i) => {
          const isHovered = hoveredIndex === i;
          return (
            <div key={d.label} className="relative flex h-full flex-1 flex-col justify-end">
              {isHovered && (
                <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap border-2 border-ink bg-bg-window px-1.5 py-0.5 font-pixel text-[9px] text-ink">
                  {d.label}: {formatAttemptCount(d.count)}
                </div>
              )}
              <div
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                className={`w-full cursor-pointer border-t-2 border-ink ${d.partial ? "border-dashed" : ""} ${
                  isHovered ? "bg-accent-taskflow" : d.partial ? "bg-accent-chattr/40" : "bg-accent-chattr"
                }`}
                style={{ height: `${(d.count / maxCount) * 100}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2">
        {days.map((d) => (
          <div key={d.label} className="flex-1 text-center text-[9px] text-ink-soft">
            {d.label}
            {d.partial ? "*" : ""}
          </div>
        ))}
      </div>
      <div className="mt-1 text-[9px] italic text-ink-soft">* today, in progress</div>
    </div>
  );
}

/** Per-payment-method checkout breakdown — the card that makes the incident
 * legible: Apple Pay visibly carries the damage (drops to ~96.7%, matching
 * Raj's "~3% of attempts" 500ing) while Card and Google Pay hold at baseline,
 * matching Priya's "All Apple Pay." Same sharp pixel-art styling as the other
 * cards. Attempts-per-method are today's live volume split by each method's
 * share, so this card refreshes on the same cadence as everything else. */
function PaymentMethodBreakdown({ rows, freshness }: { rows: PaymentMethodBreakdownRow[]; freshness: string }) {
  const clockMinutes = useSimStore((s) => s.clockMinutes);
  const totalToday = mondayAttemptsSoFar(clockMinutes);

  return (
    <div className="pixel-border mb-4 bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-[11px] text-ink-soft">Checkout success by payment method, today</div>
        <div className="text-[9px] italic text-ink-soft">{freshness}</div>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => {
          const attempts = Math.round(r.share * totalToday);
          const degraded = r.successRate < BASELINE_RATE - 0.05;
          return (
            <div key={r.method} className="flex items-center gap-2 text-[11px]">
              <div className="w-20 text-ink-soft">{r.method}</div>
              <div className="flex-1 text-ink-soft">{formatAttemptCount(attempts)} attempts</div>
              <div className={`font-pixel ${degraded ? "text-accent-danger" : "text-accent-pulse"}`}>{r.successRate.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
    messageDots,
    inputs,
  } = useCheckoutSuccessRate();
  const { value: failedCheckouts, caption: failedCheckoutsCaption } = useFailedCheckouts();
  const resolutionFired = useSimStore((s) => s.firedEventIds.has("resolution-good") || s.firedEventIds.has("resolution-cold"));
  const tone = isBaseline ? "text-accent-pulse" : recovering ? "text-accent-taskflow" : "text-accent-danger";

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

  return (
    <div className="pixel-scrollbar h-full w-full overflow-y-auto bg-[#f4f1e6] p-4 text-ink">
      <div className="mb-3 flex items-center gap-2 font-pixel text-[10px] text-ink-soft">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping bg-accent-pulse opacity-75" />
          <span className="relative inline-flex h-2 w-2 bg-accent-pulse" />
        </span>
        Checkout success rate updates live as the incident unfolds
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          { label: "Checkout success rate", value: successRate, tone, caption: freshness },
          {
            label: "Failed checkouts (Apple Pay), since incident start",
            value: failedCheckouts,
            tone: isBaseline ? "text-accent-pulse" : "text-accent-danger",
            caption: failedCheckoutsCaption as string | undefined,
          },
          { label: "Completed purchases today", value: completedToday, tone: "text-accent-pulse", caption: freshness },
          { label: "Search → cart, today", value: searchToCart, tone: "text-accent-pulse", caption: freshness },
          {
            label: "Cart → completed checkout, today",
            value: cartToCheckout,
            tone,
            caption: freshness,
          },
          { label: "Avg support response", value: "4h 02m", tone: "text-accent-taskflow", caption: undefined as string | undefined },
          { label: "CSAT (7d)", value: "82", tone: "text-accent-pulse", caption: undefined as string | undefined },
        ].map((stat) => (
          <div key={stat.label} className="pixel-border bg-white p-3">
            <div className="text-[11px] text-ink-soft">{stat.label}</div>
            <div className={`font-pixel text-lg ${stat.tone}`}>{stat.value}</div>
            {stat.caption && <div className="mt-0.5 text-[9px] italic text-ink-soft">{stat.caption}</div>}
          </div>
        ))}
      </div>

      <PaymentMethodBreakdown rows={breakdown} freshness={freshness} />

      <div className="pixel-border mb-4 bg-white p-3">
        <div className="mb-1 flex items-baseline justify-between">
          <div className="text-[11px] text-ink-soft">Checkout success rate, today</div>
          {recovering && <div className="text-[10px] italic text-accent-taskflow">Recovering…</div>}
          {resolutionFired && isBaseline && <div className="text-[10px] italic text-accent-pulse">Back to baseline.</div>}
        </div>
        <Sparkline
          history={history}
          dayStart={dayStart}
          dayEnd={dayEnd}
          incidentStartMinutes={incidentStartMinutes}
          tradeoffDecidedAtMinutes={tradeoffDecidedAtMinutes}
          clockMinutes={clockMinutes}
          messageDots={messageDots}
        />
      </div>

      <WeeklyAttemptsChart />
    </div>
  );
}
