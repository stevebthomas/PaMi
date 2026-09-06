/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL AD/GAME CONTENT — safe to delete after ad shoot is done.
 *
 * The ad's demo-local window layer: where each open window sits, how big it is
 * and what order it stacks in.
 *
 * The PLACEMENT ITSELF IS THE PRODUCT'S. This file holds no geometry of its
 * own: it calls the very functions windowStore.openWindow calls —
 * `clampSpawnSize` (never spawn bigger than the desk) and `cascadePlacement`
 * (center on the desk, plus the CASCADE_STEP/CASCADE_WRAP offset keyed on how
 * many windows have been opened so far) — against the live desk dimensions, and
 * mirrors the store's monotonic `openCount` / `nextZIndex` / `bringToFront`
 * bookkeeping so a take staggers and stacks exactly like the shipping desktop.
 * Sizes come from the shipping APP_DEFAULT_SIZE / APP_MIN_SIZE tables.
 *
 * What it does NOT do is touch the store: this is a plain value, threaded
 * through React state in AdModeShot, so a take can never write real window
 * state. Every function here is pure, so the state updaters that call them are
 * safe to re-invoke (React strict mode does).
 */

import { APP_DEFAULT_SIZE } from "@/components/desktop/appWindows";
import type { WindowFrame } from "@/components/desktop/DesktopWindow";
import {
  cascadePlacement,
  clampSpawnSize,
  clampWindowSize,
  type WindowSizeClamp,
} from "@/store/windowStore";
import type { FrontApp } from "./script";

export type DeskSize = { width: number; height: number };

export type DemoWindowLayout = {
  frames: Partial<Record<FrontApp, WindowFrame>>;
  /** Mirrors windowStore.openCount: monotonic across the whole take (it is
   * what makes each newly-opened window take the NEXT cascade step rather than
   * landing on top of an earlier one), reset only by the R hotkey. */
  openCount: number;
  /** Mirrors windowStore.nextZIndex. */
  nextZIndex: number;
};

export const EMPTY_LAYOUT: DemoWindowLayout = { frames: {}, openCount: 0, nextZIndex: 1 };

/** windowStore.bringToFront, as a pure layout transform: no-ops when the window
 * is already frontmost (the store's own needless-z-bump guard). */
export function focusWindow(layout: DemoWindowLayout, app: FrontApp): DemoWindowLayout {
  const frame = layout.frames[app];
  if (!frame) return layout;
  if (frame.zIndex === layout.nextZIndex - 1) return layout;
  return {
    ...layout,
    frames: { ...layout.frames, [app]: { ...frame, zIndex: layout.nextZIndex } },
    nextZIndex: layout.nextZIndex + 1,
  };
}

/** windowStore.moveWindow. The on-desk clamping already happened in
 * DesktopWindowView's drag handler, same as in the live app. */
export function moveWindow(layout: DemoWindowLayout, app: FrontApp, x: number, y: number): DemoWindowLayout {
  const frame = layout.frames[app];
  if (!frame) return layout;
  return { ...layout, frames: { ...layout.frames, [app]: { ...frame, x, y } } };
}

/** windowStore.resizeWindow, down to reusing its exported clamp. */
export function resizeWindow(
  layout: DemoWindowLayout,
  app: FrontApp,
  width: number,
  height: number,
  clamp: WindowSizeClamp,
): DemoWindowLayout {
  const frame = layout.frames[app];
  if (!frame) return layout;
  const next = clampWindowSize(width, height, clamp);
  if (next.width === frame.width && next.height === frame.height) return layout;
  return { ...layout, frames: { ...layout.frames, [app]: { ...frame, ...next } } };
}

/**
 * Brings the layout in line with a beat's declared window set: opens what is
 * newly listed (through the real placement math), closes what is no longer
 * listed, and raises `front`. Windows that stay open keep their exact frame,
 * including a position the actor dragged them to.
 *
 * Returns the SAME object when nothing changed, so the effect that calls it
 * settles after one pass instead of looping.
 */
export function syncLayout(
  layout: DemoWindowLayout,
  windows: FrontApp[],
  front: FrontApp,
  desk: DeskSize,
): DemoWindowLayout {
  let openCount = layout.openCount;
  let nextZIndex = layout.nextZIndex;
  const frames: Partial<Record<FrontApp, WindowFrame>> = {};
  let changed = false;

  for (const app of windows) {
    const existing = layout.frames[app];
    if (existing) {
      frames[app] = existing;
      continue;
    }
    // A newly-opened window, placed exactly as windowStore.openWindow would.
    const size = clampSpawnSize(APP_DEFAULT_SIZE[app], desk.width, desk.height);
    const position = cascadePlacement(openCount, size.width, size.height, desk.width, desk.height);
    frames[app] = { ...position, ...size, zIndex: nextZIndex };
    openCount += 1;
    nextZIndex += 1;
    changed = true;
  }

  // Anything that fell out of the declared set was closed this beat.
  if (!changed) changed = Object.keys(layout.frames).length !== windows.length;
  if (!changed) return focusWindow(layout, front);

  return focusWindow({ frames, openCount, nextZIndex }, front);
}
