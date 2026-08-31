"use client";

import { useId, useRef, useState, type MouseEvent } from "react";

/**
 * Rate-history sparkline primitive (restyled hand-rolled SVG, not recharts).
 *
 * Why not recharts: this chart carries three behaviors recharts fights hard —
 * (1) a FIXED full-day x-domain (dayStart..dayEnd) so the end dot genuinely
 * travels rightward as sim-time passes, rather than recharts' auto-scaling
 * domain pinning the latest point to the right edge every render; (2)
 * priority-based marker culling (incident/recovery/now beat day-start when
 * space is tight); and (3) monotone-cubic interpolation with NO overshoot past
 * the sharp recovery bend. All three are preserved verbatim from the original;
 * only the visual layer was moved onto the token system. See the orchestrator
 * subtask note ("restyled SVG route") for the rationale.
 *
 * Styling is entirely token-driven (CSS custom properties), so .dark works
 * automatically and there are no hex literals.
 */

const SPARKLINE_WIDTH = 280;
const SPARKLINE_HEIGHT = 72;
const SPARKLINE_PAD = 4;
// Below this pixel gap (in the sparkline's own coordinate space), a later time
// marker's label would visibly collide with a previously-kept one: dropped
// rather than stacked, since this chart is short.
const SPARKLINE_MARKER_MIN_GAP = 34;

/** Monotone cubic Hermite interpolation (Fritsch-Carlson), the same family as
 * D3's curveMonotoneX. Smooths the polyline into a curved path WITHOUT the
 * overshoot a naive Catmull-Rom spline produces past a sharp turn: load-bearing
 * because the recovery ramp is exactly that kind of sharp turn (flat degraded
 * -> steep climb -> flat baseline), and an overshooting spline would visibly
 * dip below the degraded floor or above baseline at the bend. Points must be in
 * increasing-x order (they are; x is sim-time). Returns an SVG path `d`. */
function monotonePathD(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const segDx = points[i + 1].x - points[i].x;
    const segDy = points[i + 1].y - points[i].y;
    dx.push(segDx);
    slope.push(segDx === 0 ? 0 : segDy / segDx);
  }

  const tangent: number[] = new Array(n).fill(0);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  // Fritsch-Carlson constraint: rescale adjacent tangents so the cubic between
  // two points never overshoots either endpoint's value.
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      const scale = 3 / h;
      tangent[i] = scale * a * slope[i];
      tangent[i + 1] = scale * b * slope[i];
    }
  }

  let d = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1x = p0.x + dx[i] / 3;
    const cp1y = p0.y + (tangent[i] * dx[i]) / 3;
    const cp2x = p1.x - dx[i] / 3;
    const cp2y = p1.y - (tangent[i + 1] * dx[i]) / 3;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
  }
  return d;
}

export type RateSparklineProps = {
  history: { t: number; rate: number }[];
  dayStart: number;
  dayEnd: number;
  incidentStartMinutes: number | null;
  tradeoffDecidedAtMinutes: number | null;
  clockMinutes: number;
  /** Baseline used as the top of the y-range and for the floor padding. */
  baselineRate: number;
  /** CSS custom-property name for the line/fill/end-dot color, e.g.
   * "--color-accent-green" or "--color-status-failed". Keeps the component
   * hex-free and theme-aware. */
  colorVar: string;
  /** Formats a sim-time minute value into a clock label (injected so the
   * primitive stays decoupled from the sim store). */
  formatTime: (t: number) => string;
};

export function RateSparkline({
  history,
  dayStart,
  dayEnd,
  incidentStartMinutes,
  tradeoffDecidedAtMinutes,
  clockMinutes,
  baselineRate,
  colorVar,
  formatTime,
}: RateSparklineProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gradientId = useId();
  const lineColor = `var(${colorVar})`;
  if (history.length < 2) return <div className="h-[72px]" />;

  const minRate = Math.min(...history.map((h) => h.rate)) - 0.15;
  const maxRate = baselineRate + 0.1;
  const tRange = dayEnd - dayStart || 1;

  const xForT = (t: number) => SPARKLINE_PAD + ((t - dayStart) / tRange) * (SPARKLINE_WIDTH - SPARKLINE_PAD * 2);
  const yForRate = (rate: number) =>
    SPARKLINE_HEIGHT - SPARKLINE_PAD - ((rate - minRate) / (maxRate - minRate)) * (SPARKLINE_HEIGHT - SPARKLINE_PAD * 2);
  const baselineY = SPARKLINE_HEIGHT - SPARKLINE_PAD;

  const plotPoints = history.map((h) => ({ x: xForT(h.t), y: yForRate(h.rate) }));
  const linePathD = monotonePathD(plotPoints);
  const firstPoint = plotPoints[0];
  const lastPoint = plotPoints[plotPoints.length - 1];
  const areaPathD = `${linePathD} L ${lastPoint.x.toFixed(2)},${baselineY.toFixed(2)} L ${firstPoint.x.toFixed(2)},${baselineY.toFixed(2)} Z`;
  const lastSample = history[history.length - 1];
  const lastX = xForT(lastSample.t);
  const lastY = yForRate(lastSample.rate);

  // Time markers: day start, incident start (once fired), tradeoff recovery
  // (once decided), and "now." Culled by PRIORITY, not time order — the
  // narratively load-bearing markers (incident/recovery/now) survive a
  // collision; day start yields when space is tight. Kept set is then sorted by
  // time for rendering.
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

  // Restrained vertical guides for the two narrative events only (incident /
  // fix), drawn inside the chart so their captions in the row below tie to a
  // position without shouting.
  const guides = markers.filter((m) => m.key === "incident" || m.key === "recovery");

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
        {/* preserveAspectRatio="none" keeps the crosshair/tooltip aligned: the
            default centers a letterboxed viewBox, but the hover math and the
            CSS-percent overlays both assume the viewBox spans the full width.
            Forcing "none" stretches it edge-to-edge so every overlay lines up.
            Only near-vertical strokes stretch slightly in x — fine for a
            decorative sparkline. */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-[72px] w-full cursor-crosshair"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: lineColor, stopOpacity: 0.16 }} />
              <stop offset="100%" style={{ stopColor: lineColor, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {guides.map((g) => (
            <line
              key={g.key}
              x1={g.x}
              x2={g.x}
              y1={SPARKLINE_PAD}
              y2={baselineY}
              stroke="var(--color-text-secondary)"
              strokeWidth={1}
              strokeDasharray="2 3"
              strokeOpacity={0.35}
            />
          ))}
          <path d={areaPathD} fill={`url(#${gradientId})`} stroke="none" />
          <path d={linePathD} fill="none" stroke={lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {/* Current-value endpoint: a surface-colored halo behind a solid dot
              so it reads against the area fill in both themes. */}
          <circle cx={lastX} cy={lastY} r={4} fill="var(--color-surface)" />
          <circle cx={lastX} cy={lastY} r={2.5} fill={lineColor} />
          {hovered && (
            <circle cx={xForT(hovered.t)} cy={yForRate(hovered.rate)} r={2.5} fill="none" stroke="var(--color-text-primary)" strokeWidth={1} />
          )}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-[var(--radius-control)] border border-border-hairline bg-surface px-2 py-1 font-mono text-[10px] tabular-nums text-text-primary shadow-sm"
            style={{
              left: `${(xForT(hovered.t) / SPARKLINE_WIDTH) * 100}%`,
              top: `${(yForRate(hovered.rate) / SPARKLINE_HEIGHT) * 100}%`,
            }}
          >
            {formatTime(hovered.t)} · {hovered.rate.toFixed(1)}%
          </div>
        )}
      </div>
      <div className="relative mt-1.5 h-7 w-full">
        {markers.map((m) => (
          <div
            key={m.key}
            className="absolute -translate-x-1/2 whitespace-nowrap text-center"
            style={{ left: `${(m.x / SPARKLINE_WIDTH) * 100}%` }}
          >
            <div className="font-mono text-[10px] tabular-nums text-text-secondary">{formatTime(m.t)}</div>
            <div className="text-[10px] text-text-secondary/80">{m.caption}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
