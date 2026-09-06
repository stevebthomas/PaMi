/**
 * The static app registry's window facts: the AppId union and the two per-app
 * size tables the desktop's window layer needs.
 *
 * Split out of Desktop.tsx (which re-exports all three under their existing
 * names, so every importer is unchanged) purely so these plain data tables can
 * be imported WITHOUT pulling in Desktop.tsx's whole module graph — every app
 * component, the sim/docs stores and the session-persistence layer. The values
 * below are verbatim the ones Desktop.tsx defined.
 */

export type AppId = "chattr" | "pulse" | "taskflow" | "askClaude" | "reviews" | "notes" | "office" | "docs";

export const APP_DEFAULT_SIZE: Record<AppId, { width: number; height: number }> = {
  chattr: { width: 760, height: 600 },
  pulse: { width: 700, height: 560 },
  taskflow: { width: 700, height: 560 },
  askClaude: { width: 640, height: 580 },
  reviews: { width: 640, height: 580 },
  notes: { width: 480, height: 520 },
  office: { width: 860, height: 660 },
  docs: { width: 640, height: 600 },
};

/** Smallest each window may be resized to (see DesktopWindow's resize handle).
 * Derived from each app's internal reflow: Chattr needs both fixed rails plus a
 * usable thread; Pulse/Taskflow need their card grids to survive a 2-up
 * collapse; Office/Docs go single-column at their floor; the simpler apps share
 * a generic 360x360 minimum. */
export const APP_MIN_SIZE: Record<AppId, { width: number; height: number }> = {
  chattr: { width: 540, height: 420 },
  pulse: { width: 460, height: 400 },
  taskflow: { width: 480, height: 400 },
  askClaude: { width: 360, height: 360 },
  reviews: { width: 360, height: 360 },
  notes: { width: 360, height: 360 },
  office: { width: 400, height: 400 },
  docs: { width: 380, height: 360 },
};
