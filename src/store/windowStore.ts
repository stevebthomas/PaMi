import { create } from "zustand";
import type { AppId } from "@/components/desktop/appWindows";

/**
 * Window key. Static app windows are keyed by their static AppId (one window
 * per app). Documents each get their OWN independent window, keyed
 * `doc:${docId}`, so multiple docs can be open at once as separate,
 * independently closable windows. AppId itself is left untouched: taskbar and
 * app-launch logic stays app-only, and only the window layer knows about the
 * wider key.
 */
export type WindowId = AppId | `doc:${string}`;

const DOC_WINDOW_PREFIX = "doc:";

/** Build the window key for a document's own window. */
export function docWindowId(docId: string): WindowId {
  return `${DOC_WINDOW_PREFIX}${docId}`;
}

/** True when a window key is a per-document window (vs. a static app window).
 * A type guard so the negative branch narrows back to AppId — none of the
 * AppIds start with `doc:` (note `docs` lacks the colon), so this never
 * misclassifies the Docs library window as a doc window. */
export function isDocWindowId(id: WindowId): id is `doc:${string}` {
  return id.startsWith(DOC_WINDOW_PREFIX);
}

/** Recover the docId from a doc window key, or null for a static app window. */
export function docIdFromWindowId(id: WindowId): string | null {
  return isDocWindowId(id) ? id.slice(DOC_WINDOW_PREFIX.length) : null;
}

export interface WindowInstance {
  id: WindowId;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface WindowStoreState {
  /** At most one window per key: reopening an already-open app (or an
   * already-open document) brings it to front instead of spawning a duplicate.
   * Keys are AppId for the static app windows plus `doc:${docId}` for each
   * open document's own window. */
  windows: Partial<Record<WindowId, WindowInstance>>;
  nextZIndex: number;
  openCount: number;

  openWindow: (
    id: WindowId,
    defaults: { width: number; height: number },
    deskWidth: number,
    deskHeight: number
  ) => void;
  bringToFront: (id: WindowId) => void;
  moveWindow: (id: WindowId, x: number, y: number) => void;
  /** Resizes a window, clamping to the per-app minimum and to the desk
   * bounds the caller passes in. Mirrors moveWindow's store-only shape: the
   * clamp bounds (per-app min from Desktop's APP_MIN_SIZE, max from the live
   * containerRef) are threaded in by DesktopWindow rather than read here, so
   * the store keeps no dependency on Desktop's size tables or the DOM. */
  resizeWindow: (id: WindowId, width: number, height: number, clamp: WindowSizeClamp) => void;
  /** Closes the window (removes it from view/state). The underlying app
   * data (Chattr messages, Ask Claude history, etc.) lives in its own
   * store and is untouched, so reopening via the taskbar picks up where
   * it left off. For document windows this is the SINGLE close path: there is
   * no separate open-docs mirror to keep in sync — the windows map is the sole
   * source of truth for which docs are open. */
  closeWindow: (id: WindowId) => void;
}

const CASCADE_STEP = 28;
const CASCADE_WRAP = 5;
/** Breathing room kept between a spawned window's far edge and the desk edge:
 * mirrors DesktopWindow's RESIZE_MARGIN so a window opens no larger than it can
 * later be resized to. */
const DESK_MARGIN = 16;
/** Absolute smallest a window may spawn when the desk itself is tiny. Per-app
 * minimums (Desktop's APP_MIN_SIZE) are enforced in the resize path, not here:
 * openWindow doesn't receive them; this is only a sane floor for the clamp. */
const SPAWN_HARD_FLOOR = 200;
/** Smallest top-left inset a spawned window may sit at, and the floor the
 * on-desk upper bound is guarded with. */
const SPAWN_MIN_INSET = 16;

/**
 * Spawn size for a window: never larger than the desk. A window taller/wider
 * than the desk pushes its bottom-right resize handle off the visible area and
 * out of reach (Office's 660px default on a ~650px laptop desk did exactly
 * this). Clamps to desk-minus-margin, with the same max<min inversion guard
 * resizeWindow uses (a hard floor here, since per-app minimums aren't available
 * at open time: they stay enforced in the resize path).
 *
 * PURE. Extracted from openWindow so a non-store surface (the ad-mode filming
 * route's demo-local window layer) can place windows through the exact same
 * math the product uses instead of re-deriving it. openWindow is its only
 * in-app caller and its result is unchanged.
 */
export function clampSpawnSize(
  defaults: { width: number; height: number },
  deskWidth: number,
  deskHeight: number
): { width: number; height: number } {
  return {
    width: Math.min(defaults.width, Math.max(SPAWN_HARD_FLOOR, deskWidth - DESK_MARGIN)),
    height: Math.min(defaults.height, Math.max(SPAWN_HARD_FLOOR, deskHeight - DESK_MARGIN)),
  };
}

/**
 * Where the `openCount`-th window of a session lands: centered on the desk
 * using its (already clamped) size, plus the cascade offset that wraps every
 * CASCADE_WRAP windows, then clamped on-desk.
 *
 * The SPAWN_MIN_INSET floor is the long-standing top-left minimum; the upper
 * bound keeps the window fully on-desk so the cascade offset can't push a
 * desk-sized window's bottom/right (and thus its resize handle) back
 * off-screen. For normal sub-desk windows deskDim − size stays larger than the
 * cascaded center, so the cascade is preserved untouched.
 *
 * PURE, same extraction rationale as clampSpawnSize above.
 */
export function cascadePlacement(
  openCount: number,
  width: number,
  height: number,
  deskWidth: number,
  deskHeight: number
): { x: number; y: number } {
  const cascade = (openCount % CASCADE_WRAP) * CASCADE_STEP;
  const centeredX = Math.round((deskWidth - width) / 2) + cascade;
  const centeredY = Math.round((deskHeight - height) / 2) + cascade;
  return {
    x: Math.min(Math.max(SPAWN_MIN_INSET, centeredX), Math.max(SPAWN_MIN_INSET, deskWidth - width)),
    y: Math.min(Math.max(SPAWN_MIN_INSET, centeredY), Math.max(SPAWN_MIN_INSET, deskHeight - height)),
  };
}

/** Bounds a resize is clamped into: per-app floor from Desktop's APP_MIN_SIZE,
 * ceiling from the live desk. */
export interface WindowSizeClamp {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

/**
 * The resize clamp, PURE. Guards the upper bound against a desk smaller than
 * the min (max<min on a tiny viewport) so the clamp never inverts and pins the
 * window to 0. resizeWindow is its only in-app caller (same result as before);
 * exported for the same demo-local reuse as the two functions above.
 */
export function clampWindowSize(
  width: number,
  height: number,
  clamp: WindowSizeClamp
): { width: number; height: number } {
  const maxWidth = Math.max(clamp.minWidth, clamp.maxWidth);
  const maxHeight = Math.max(clamp.minHeight, clamp.maxHeight);
  return {
    width: Math.round(Math.min(Math.max(width, clamp.minWidth), maxWidth)),
    height: Math.round(Math.min(Math.max(height, clamp.minHeight), maxHeight)),
  };
}

export const useWindowStore = create<WindowStoreState>((set, get) => ({
  windows: {},
  nextZIndex: 1,
  openCount: 0,

  openWindow: (id, defaults, deskWidth, deskHeight) => {
    if (get().windows[id]) {
      get().bringToFront(id);
      return;
    }

    // Never spawn a window larger than the desk (clampSpawnSize), then center
    // the CLAMPED size and apply the cascade offset (cascadePlacement) so a
    // clamped window still centers and still lands fully on-desk.
    const { width, height } = clampSpawnSize(defaults, deskWidth, deskHeight);
    const { x, y } = cascadePlacement(get().openCount, width, height, deskWidth, deskHeight);
    const zIndex = get().nextZIndex;

    set((s) => ({
      windows: { ...s.windows, [id]: { id, x, y, width, height, zIndex } },
      nextZIndex: zIndex + 1,
      openCount: s.openCount + 1,
    }));
  },

  bringToFront: (id) => {
    const existing = get().windows[id];
    if (!existing) return;
    const zIndex = get().nextZIndex;
    if (existing.zIndex === zIndex - 1) return; // already frontmost, avoid a needless z-bump
    set((s) => ({
      windows: { ...s.windows, [id]: { ...existing, zIndex } },
      nextZIndex: zIndex + 1,
    }));
  },

  moveWindow: (id, x, y) => {
    set((s) => {
      const w = s.windows[id];
      if (!w) return s;
      return { windows: { ...s.windows, [id]: { ...w, x, y } } };
    });
  },

  resizeWindow: (id, width, height, clamp) => {
    set((s) => {
      const w = s.windows[id];
      if (!w) return s;
      const { width: nextWidth, height: nextHeight } = clampWindowSize(width, height, clamp);
      if (nextWidth === w.width && nextHeight === w.height) return s;
      return { windows: { ...s.windows, [id]: { ...w, width: nextWidth, height: nextHeight } } };
    });
  },

  closeWindow: (id) => {
    set((s) => {
      if (!s.windows[id]) return s;
      const next = { ...s.windows };
      delete next[id];
      return { windows: next };
    });
  },
}));
