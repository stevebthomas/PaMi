import { DAY_START_MINUTES, DAY_END_MINUTES } from "@/data/day1-scenario";

/** H:MM AM/PM from sim-clock minutes. THE shared formatter for this shape,
 * since several leaf modules (dmContacts.ts, sessionObservations.ts) that
 * can't import simStore.ts's own formatSimTime (it would drag in the whole
 * store) previously each carried their own hand-copied version of this same
 * function. This is the one meant to be imported instead of re-copied
 * again; new code should reach for this, not add a fourth copy. */
export function formatSimClock(minutes: number): string {
  // Wrap onto a 24h clock first so a minute from "the day before" (e.g.
  // incidentTimeline.ts's DEGRADATION_STARTED_AT = -13, 11:47 PM the prior
  // night) reads correctly instead of producing a negative hour/minute.
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

/** How far through the working day the sim clock currently is, 0 (day
 * start) to 1 (the hard end-of-day boundary). Falls back to 0 for a day
 * with no defined bounds rather than throwing, since the ambient effects
 * that consume this are decorative. */
export function getDayProgress(clockMinutes: number, day: number): number {
  const start = DAY_START_MINUTES[day];
  const end = DAY_END_MINUTES[day];
  if (start === undefined || end === undefined || end <= start) return 0;
  return Math.max(0, Math.min(1, (clockMinutes - start) / (end - start)));
}

interface ColorStop {
  t: number;
  r: number;
  g: number;
  b: number;
  opacity: number;
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

/** Shared stop-interpolation, used by both the ambient tint and the sun's
 * own color so the two color ramps are computed the same way instead of
 * two hand-copied lerp loops drifting apart. */
function interpolateStops(stops: ColorStop[], progress: number): { color: string; opacity: number } {
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (progress >= stops[i].t && progress <= stops[i + 1].t) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }
  const span = upper.t - lower.t;
  const f = span === 0 ? 0 : (progress - lower.t) / span;
  const r = Math.round(lerp(lower.r, upper.r, f));
  const g = Math.round(lerp(lower.g, upper.g, f));
  const b = Math.round(lerp(lower.b, upper.b, f));
  const opacity = lerp(lower.opacity, upper.opacity, f);
  return { color: `rgb(${r}, ${g}, ${b})`, opacity };
}

/** Morning -> midday -> afternoon -> dusk, deliberately subtle (see the
 * opacity values). This is meant to be easy to miss if you're not looking,
 * not a dramatic scene change layered over the actual work on screen. */
const TINT_STOPS: ColorStop[] = [
  { t: 0, r: 255, g: 244, b: 214, opacity: 0.1 }, // pale morning light
  { t: 0.35, r: 255, g: 255, b: 255, opacity: 0.05 }, // neutral midday
  { t: 0.65, r: 255, g: 196, b: 120, opacity: 0.1 }, // warm afternoon
  { t: 1, r: 210, g: 100, b: 130, opacity: 0.16 }, // dusk, approaching the hard end
];

/** The ambient overlay color/opacity for the current point in the day. */
export function getAmbientTint(progress: number): { color: string; opacity: number } {
  return interpolateStops(TINT_STOPS, progress);
}

/** Sunrise -> midday -> sunset, fully opaque: unlike the ambient tint this
 * one IS meant to be plainly visible, it's the explicit "here's what time it
 * is" cue the subtle tint alone wasn't giving players. */
const SUN_STOPS: ColorStop[] = [
  { t: 0, r: 255, g: 214, b: 163, opacity: 1 }, // sunrise, pale warm
  { t: 0.4, r: 255, g: 244, b: 194, opacity: 1 }, // bright midday
  { t: 1, r: 255, g: 122, b: 77, opacity: 1 }, // sunset, deep orange
];

/** These are the WALLPAPER_VIEWBOX-space coordinates of the back mountain
 * range's polygon in Wallpaper.tsx (the lighter, more sharply-peaked of the
 * two ridge layers): literally copied from that polygon's own points, not
 * eyeballed. A rise/set path computed from a DIFFERENT set of numbers than
 * the actual silhouette is exactly the bug this pass exists to fix, so if
 * that polygon's points ever change, these four numbers need to change with
 * them (the peaks either side of each chosen valley are only here as a
 * comment, for a human sanity-checking the geometry). */
export const WALLPAPER_VIEWBOX = { width: 320, height: 180 };
// Valley at x=40 (y=144), between the peaks at x=20 (y=140) and x=60 (y=132).
const SUNRISE_GAP = { x: 40, y: 144 };
// Valley at x=280 (y=124), between the peaks at x=260 (y=116) and x=300 (y=114).
const SUNSET_GAP = { x: 280, y: 124 };
/** How far below its gap's valley floor the sun sits at day start/end:
 * comfortably inside the mountain polygon's fill (which extends from the
 * silhouette line down to the bottom of the scene), so it's genuinely
 * hidden behind the terrain, not just touching the line. */
const HIDDEN_DEPTH = 14;
/** How high above the sunrise/sunset baseline the sun climbs at midday:
 * tuned so the peak (y ≈ 36) clears the tallest peak in the range (y = 114
 * at x=300) by a wide margin, well up into the sky bands. */
const ARC_HEIGHT = 112;

/** Sun position, in the SAME viewBox coordinate space as the mountain
 * silhouette (see WALLPAPER_VIEWBOX/Wallpaper.tsx), not a percentage of
 * the screen. Rendering the sun inside that same <svg>, behind the mountain
 * polygons in paint order, is what makes "hidden behind the mountains" and
 * "emerges through this specific gap" happen for free: whenever the sun's
 * position falls under a polygon's fill, that polygon simply paints over
 * it, at whatever size/crop the wallpaper is actually rendered at. A
 * percentage-based position computed separately from the mountains can't
 * guarantee that alignment survives different window aspect ratios; living
 * in the same coordinate space is what guarantees it. */
export function getSunPosition(progress: number): { x: number; y: number; color: string } {
  const p = Math.max(0, Math.min(1, progress));
  const x = SUNRISE_GAP.x + p * (SUNSET_GAP.x - SUNRISE_GAP.x);
  const baseline = lerp(SUNRISE_GAP.y + HIDDEN_DEPTH, SUNSET_GAP.y + HIDDEN_DEPTH, p);
  const y = baseline - ARC_HEIGHT * Math.sin(p * Math.PI);
  const { color } = interpolateStops(SUN_STOPS, p);
  return { x, y, color };
}

/** Battery level, full at day start down to empty right as the day ends:
 * the same progress value the ambient tint uses, just inverted. */
export function getBatteryLevel(progress: number): number {
  return Math.max(0, Math.min(1, 1 - progress));
}
