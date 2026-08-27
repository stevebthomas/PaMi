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
  /** At most one window per app — reopening an already-open app brings it
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
  /** Closes the window (removes it from view/state). The underlying app
   * data — Chattr messages, Ask Claude history, etc. — lives in its own
   * store and is untouched, so reopening via the taskbar picks up where
   * it left off. */
  closeWindow: (id: AppId) => void;
}

const CASCADE_STEP = 28;
const CASCADE_WRAP = 5;

export const useWindowStore = create<WindowStoreState>((set, get) => ({
  windows: {},
  nextZIndex: 1,
  openCount: 0,

  openWindow: (id, defaults, deskWidth, deskHeight) => {
    if (get().windows[id]) {
      get().bringToFront(id);
      return;
    }

    const cascade = (get().openCount % CASCADE_WRAP) * CASCADE_STEP;
    const x = Math.max(16, Math.round((deskWidth - defaults.width) / 2) + cascade);
    const y = Math.max(16, Math.round((deskHeight - defaults.height) / 2) + cascade);
    const zIndex = get().nextZIndex;

    set((s) => ({
      windows: { ...s.windows, [id]: { id, x, y, width: defaults.width, height: defaults.height, zIndex } },
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

  closeWindow: (id) => {
    set((s) => {
      if (!s.windows[id]) return s;
      const next = { ...s.windows };
      delete next[id];
      return { windows: next };
    });
  },
}));
