/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL AD/GAME CONTENT — safe to delete after ad shoot is done.
 *
 * The ad's demo-local window layer: where each open window sits, how big it is
 * and what order it stacks in.
 *
 * TWO-WINDOW MOMENTS ARE SPLIT-SCREEN (Chattr left, the other app right); see
 * splitLayoutFrames below. Everything else — a lone window, or a third one the
 * actor opens by hand — keeps the product's centered/cascaded placement.
 *
 * THE CLAMPING IS THE PRODUCT'S EVERYWHERE, split included. This file holds no
 * clamp of its own: it calls the very functions windowStore.openWindow calls —
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

import { APP_DEFAULT_SIZE, APP_MIN_SIZE } from "@/components/desktop/appWindows";
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

/* ------------------------------------------------------------ split screen */

/**
 * THE TWO-WINDOW SPLIT. Whenever exactly two windows are on the desk, they are
 * laid out SIDE BY SIDE — Chattr left, the other app right — instead of
 * cascaded.
 *
 * WHY, on camera: the cascade centers each window and steps it by a few pixels,
 * so on a normal desk the second window lands almost exactly on top of the
 * first (in a measured take: Chattr at x=340 and Office at x=346, i.e. Office
 * covering all but 6px of it). Every two-window moment in the ad is a moment
 * where BOTH windows are the point — the message that explains the spike and
 * the spike itself, the instruction and the roster, the thread and the doc — so
 * the shot needs them both legible at once.
 *
 * NOT A MECHANICAL 50/50. Each app has a width below which its own layout stops
 * being worth filming, and they differ: Chattr has to hold its channel rail
 * plus a readable thread, while Pulse's hero-and-tiles board and Office's room
 * grid need noticeably more. So the desk is divided in proportion to
 * SPLIT_PREFERRED_WIDTH, floored at SPLIT_MIN_WIDTH, and only squeezed below
 * that when the desk itself cannot fit both.
 *
 * THE GEOMETRY IS STILL THE PRODUCT'S. This file computes a target rectangle
 * and then hands it to the SAME primitives windowStore uses — `clampSpawnSize`
 * (never bigger than the desk) and `clampWindowSize` with the shipping
 * APP_MIN_SIZE floor — so a split window is clamped by exactly the rules a
 * dragged or resized one is. Nothing here re-implements clamping, and the
 * frames it produces are ordinary frames: both windows stay fully draggable and
 * resizable the moment they land (see the "only re-place when the SET changes"
 * rule in syncLayout).
 */
const SPLIT_GUTTER_PX = 16;
/** Desk inset on all four sides. Matches windowStore's own DESK_MARGIN, so a
 * split window sits exactly as far off the edge as a spawned one may. */
const SPLIT_MARGIN_PX = 16;

/**
 * Smallest width at which each app is still worth filming, and the share
 * weights the surplus is divided by. Chattr's rail + thread reads from ~560px;
 * Pulse's hero + stat tiles and Office's room grid want ~700px; the Docs window
 * is a single column of text at ~640px.
 */
const SPLIT_MIN_WIDTH: Record<FrontApp, number> = {
  chattr: 560,
  pulse: 700,
  office: 700,
  docs: 640,
  taskflow: 640,
};
const SPLIT_PREFERRED_WIDTH: Record<FrontApp, number> = {
  chattr: 620,
  pulse: 780,
  office: 800,
  docs: 660,
  taskflow: 700,
};

/** One side of the split, clamped by the real primitives. */
function splitFrame(
  app: FrontApp,
  slotWidth: number,
  slotHeight: number,
  desk: DeskSize,
  zIndex: number,
  x: number,
): WindowFrame {
  // Never bigger than the desk — windowStore's own spawn guard.
  const spawn = clampSpawnSize({ width: slotWidth, height: slotHeight }, desk.width, desk.height);
  // Then the shipping resize clamp, so the per-app APP_MIN_SIZE floor applies
  // exactly as it does when the actor drags the resize grip.
  const size = clampWindowSize(spawn.width, spawn.height, {
    minWidth: APP_MIN_SIZE[app].width,
    minHeight: APP_MIN_SIZE[app].height,
    maxWidth: spawn.width,
    maxHeight: spawn.height,
  });
  return { ...size, x, y: SPLIT_MARGIN_PX, zIndex };
}

/**
 * Frames for a two-window desk: Chattr flush to the left margin, the other app
 * flush to the right one, both full desk height less the margins.
 *
 * Right-aligning the second window (rather than butting it against the gutter)
 * is what keeps the composition symmetrical and guarantees it stays fully
 * on-desk after the clamps have had their say; any width the clamps take back
 * widens the gutter instead of leaving a gap at the edge.
 */
function splitLayoutFrames(
  windows: FrontApp[],
  desk: DeskSize,
  zFor: (app: FrontApp) => number,
): Partial<Record<FrontApp, WindowFrame>> | null {
  if (windows.length !== 2) return null;
  const other = windows.find((app) => app !== "chattr");
  if (!windows.includes("chattr") || !other) return null;

  const usable = desk.width - SPLIT_MARGIN_PX * 2 - SPLIT_GUTTER_PX;
  const minLeft = SPLIT_MIN_WIDTH.chattr;
  const minRight = SPLIT_MIN_WIDTH[other];
  const prefLeft = SPLIT_PREFERRED_WIDTH.chattr;
  const prefRight = SPLIT_PREFERRED_WIDTH[other];

  let left: number;
  if (usable >= minLeft + minRight) {
    // Both fit: give each its minimum and hand the surplus out in proportion to
    // what each app would rather have.
    const surplus = usable - minLeft - minRight;
    left = Math.round(minLeft + (surplus * prefLeft) / (prefLeft + prefRight));
  } else {
    // A desk too narrow for both minimums: scale by preference and let each
    // window's own APP_MIN_SIZE floor catch it in splitFrame.
    left = Math.round((usable * prefLeft) / (prefLeft + prefRight));
  }
  const right = usable - left;
  const height = desk.height - SPLIT_MARGIN_PX * 2;

  const leftFrame = splitFrame("chattr", left, height, desk, zFor("chattr"), SPLIT_MARGIN_PX);
  const rightFrame = splitFrame(other, right, height, desk, zFor(other), 0);
  // Flush right, computed after clamping so the window is always fully on-desk.
  rightFrame.x = Math.max(
    leftFrame.x + leftFrame.width + SPLIT_GUTTER_PX,
    desk.width - SPLIT_MARGIN_PX - rightFrame.width,
  );
  return { chattr: leftFrame, [other]: rightFrame };
}

/**
 * Brings the layout in line with a beat's declared window set: opens what is
 * newly listed, closes what is no longer listed, and raises `front`.
 *
 * PLACEMENT depends on the resulting SET:
 *   - exactly two windows including Chattr -> the SPLIT above, both windows
 *     re-placed, because a split is only a split if both sides move;
 *   - exactly one window -> centered, through the product's own
 *     `cascadePlacement` at cascade step 0 (so a Chattr left over from a split
 *     comes back to the middle of the desk when its partner closes);
 *   - anything else -> the original behaviour: newly opened windows land on the
 *     next cascade step and everything already open keeps its exact frame.
 *
 * ONLY WHEN THE SET CHANGES. A mere focus change (clicking a window, or a beat
 * that only swaps `front`) never re-places anything, so a window the actor has
 * dragged or resized mid-beat stays exactly where they put it until the desk's
 * window set itself changes.
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
  // Nothing opened and nothing closed: the set is what it was, so no window
  // moves — only the front one is raised. This is the guard that lets a window
  // the actor dragged stay dragged.
  if (!changed) return focusWindow(layout, front);

  // THE SET CHANGED, so this beat gets to compose the desk.
  const split = splitLayoutFrames(windows, desk, (app) => frames[app]?.zIndex ?? nextZIndex - 1);
  if (split) {
    return focusWindow({ frames: split, openCount, nextZIndex }, front);
  }
  if (windows.length === 1) {
    const only = windows[0];
    const size = clampSpawnSize(APP_DEFAULT_SIZE[only], desk.width, desk.height);
    // Cascade step 0 is the product's own "centered on the desk".
    const position = cascadePlacement(0, size.width, size.height, desk.width, desk.height);
    return focusWindow(
      { frames: { [only]: { ...position, ...size, zIndex: frames[only]?.zIndex ?? nextZIndex - 1 } }, openCount, nextZIndex },
      front,
    );
  }

  return focusWindow({ frames, openCount, nextZIndex }, front);
}
