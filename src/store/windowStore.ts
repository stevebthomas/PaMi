import { create } from "zustand";
import type { AppId } from "@/components/desktop/Desktop";

export interface WindowInstance {
  id: AppId;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

interface WindowStoreState {
  /** At most one window per app: reopening an already-open app brings it
   * to front instead of spawning a duplicate. */
  windows: Partial<Record<AppId, WindowInstance>>;
  nextZIndex: number;
  openCount: number;

  openWindow: (
    id: AppId,
    defaults: { width: number; height: number },
    deskWidth: number,
    deskHeight: number
  ) => void;
  bringToFront: (id: AppId) => void;
  moveWindow: (id: AppId, x: number, y: number) => void;
  /** Resizes a window, clamping to the per-app minimum and to the desk
   * bounds the caller passes in. Mirrors moveWindow's store-only shape: the
   * clamp bounds (per-app min from Desktop's APP_MIN_SIZE, max from the live
   * containerRef) are threaded in by DesktopWindow rather than read here, so
   * the store keeps no dependency on Desktop's size tables or the DOM. */
  resizeWindow: (
    id: AppId,
    width: number,
    height: number,
    clamp: { minWidth: number; minHeight: number; maxWidth: number; maxHeight: number }
  ) => void;
  /** Closes the window (removes it from view/state). The underlying app
   * data (Chattr messages, Ask Claude history, etc.) lives in its own
   * store and is untouched, so reopening via the taskbar picks up where
   * it left off. */
  closeWindow: (id: AppId) => void;
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

export const useWindowStore = create<WindowStoreState>((set, get) => ({
  windows: {},
  nextZIndex: 1,
  openCount: 0,

  openWindow: (id, defaults, deskWidth, deskHeight) => {
    if (get().windows[id]) {
      get().bringToFront(id);
      return;
    }

    // Never spawn a window larger than the desk. A window taller/wider than the
    // desk pushes its bottom-right resize handle off the visible area and out of
    // reach (Office's 660px default on a ~650px laptop desk did exactly this).
    // Clamp the spawn size to desk-minus-margin, with the same max<min inversion
    // guard resizeWindow uses (a hard floor here, since per-app minimums aren't
    // available at open time: they stay enforced in the resize path).
    const width = Math.min(defaults.width, Math.max(SPAWN_HARD_FLOOR, deskWidth - DESK_MARGIN));
    const height = Math.min(defaults.height, Math.max(SPAWN_HARD_FLOOR, deskHeight - DESK_MARGIN));

    // Center using the CLAMPED size so a clamped window still centers. The 16px
    // floor is the existing top-left minimum; the added upper bound keeps the
    // window fully on-desk so the cascade offset can't push a desk-sized
    // window's bottom/right (and thus its resize handle) back off-screen (the
    // literal bug, since Office opens at an unpredictable cascade step). For
    // normal sub-desk windows deskDim − size stays larger than the cascaded
    // center, so cascade is preserved untouched.
    const cascade = (get().openCount % CASCADE_WRAP) * CASCADE_STEP;
    const centeredX = Math.round((deskWidth - width) / 2) + cascade;
    const centeredY = Math.round((deskHeight - height) / 2) + cascade;
    const x = Math.min(Math.max(16, centeredX), Math.max(16, deskWidth - width));
    const y = Math.min(Math.max(16, centeredY), Math.max(16, deskHeight - height));
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
      // Guard the upper bound against a desk smaller than the min (max<min on a
      // tiny viewport) so the clamp never inverts and pins the window to 0.
      const maxWidth = Math.max(clamp.minWidth, clamp.maxWidth);
      const maxHeight = Math.max(clamp.minHeight, clamp.maxHeight);
      const nextWidth = Math.round(Math.min(Math.max(width, clamp.minWidth), maxWidth));
      const nextHeight = Math.round(Math.min(Math.max(height, clamp.minHeight), maxHeight));
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
