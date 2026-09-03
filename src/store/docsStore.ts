import { create } from "zustand";
import { useWindowStore } from "@/store/windowStore";

/**
 * Docs app state: which doc is showing plus the launch-animation flags.
 *
 * NOT PERSISTED, by design: like windowStore and costStore, this is transient
 * UI plumbing (an open/animating window, a busy cursor), not sim state worth
 * surviving a refresh. sessionPersistence.ts snapshots only simStore +
 * taskflowStore; leave this out of that scope.
 */

/** Duration of the dock-bounce launch animation. This is a PURE UI ANIMATION
 * timer, not a sim-advancing wall-clock timer: it never touches the sim clock
 * or NPC behavior, so it does NOT violate the project's no-wall-clock-timers
 * rule. Same carve-out as the persistence debounce in sessionPersistence.ts. */
const LAUNCH_MS = 900;

/** CSS class toggled on <body> to read the pointer as busy during a launch
 * (see globals.css). */
const BUSY_CURSOR_CLASS = "cursor-busy";

/** How many docs the Docs window can show side by side. Two enables the core
 * use case: comparing Maya's two mockups without losing your place in either. */
const MAX_OPEN_DOCS = 2;

/** Merge `docId` into the open panes, oldest-first (index 0 = least recently
 * opened, last = most recent):
 *   - already open  -> unchanged (a re-open just resurfaces the window; the
 *     pane stays put so nothing visibly jumps).
 *   - a pane free    -> appended, filling the empty pane.
 *   - both full      -> evict the least-recently-opened (index 0); the survivor
 *     shifts to the left/top pane and the new doc enters as the newest.
 * Pure so both entry points (chip + library tile) share identical rules. */
function mergeOpenDoc(ids: string[], docId: string): string[] {
  if (ids.includes(docId)) return ids;
  if (ids.length < MAX_OPEN_DOCS) return [...ids, docId];
  return [...ids.slice(1), docId];
}

interface DocsStoreState {
  /** SIM_DOCS entries the viewer should show, as split panes. Empty = library
   * view. Ordered oldest-first; rendered left-to-right (or top-to-bottom when
   * the window is too narrow for a readable split). Capped at MAX_OPEN_DOCS. */
  openDocIds: string[];
  /** True while the dock-bounce launch animation is running (the Docs icon
   * hops and the cursor reads busy). */
  launching: boolean;
  /** Set true when a launch finishes and the Docs window should be opened.
   * Desktop.tsx (the ONLY caller of openWindow with real desk bounds) watches
   * this, opens the window centered/cascaded like every other app, then clears
   * it via clearPendingOpen. */
  pendingOpen: boolean;

  /** Chattr chip entry point: request that `docId` be shown in Docs. If the
   * Docs window is already open, just add the doc to the panes and surface the
   * window (no bounce). Otherwise play the ~900ms dock-bounce launch, then
   * signal Desktop to open the window. */
  openDocRequest: (docId: string) => void;
  /** Desktop clears the open signal once it has actually opened the window. */
  clearPendingOpen: () => void;
  /** Closes one pane (its quiet close affordance). Removing the last open pane
   * returns to the library view. Does not touch window state: the Docs window
   * itself stays open. */
  closeDoc: (docId: string) => void;
  /** Library-tile entry point: the Docs window is already open (this is
   * called from inside it), so just add the doc to the panes directly: no
   * bounce, no window-open signal. Contrast with openDocRequest, the
   * chattr-chip entry point that has to first ensure the window exists. */
  setActiveDoc: (docId: string) => void;
}

/** Toggle the busy-pointer class on <body>. Guarded for SSR (no document) and
 * idempotent, so it can never strand the cursor. */
function setBusyCursor(on: boolean): void {
  if (typeof document === "undefined") return;
  document.body.classList.toggle(BUSY_CURSOR_CLASS, on);
}

export const useDocsStore = create<DocsStoreState>((set, get) => ({
  openDocIds: [],
  launching: false,
  pendingOpen: false,

  openDocRequest: (docId) => {
    set((s) => ({ openDocIds: mergeOpenDoc(s.openDocIds, docId) }));

    // Already open: no launch animation, just show the new doc and raise the
    // window to the front.
    if (useWindowStore.getState().windows.docs) {
      useWindowStore.getState().bringToFront("docs");
      return;
    }

    // Re-entrancy guard: a launch is already animating. The in-flight timer
    // will open the window with whatever docs are now in the panes (already
    // updated above), so don't start a second bounce or a second busy-cursor
    // toggle: that's what keeps the cursor leak-proof if the chip is clicked
    // twice.
    if (get().launching) return;

    set({ launching: true });
    setBusyCursor(true);
    setTimeout(() => {
      setBusyCursor(false);
      set({ launching: false, pendingOpen: true });
    }, LAUNCH_MS);
  },

  clearPendingOpen: () => set({ pendingOpen: false }),

  closeDoc: (docId) =>
    set((s) => ({ openDocIds: s.openDocIds.filter((id) => id !== docId) })),

  setActiveDoc: (docId) =>
    set((s) => ({ openDocIds: mergeOpenDoc(s.openDocIds, docId) })),
}));
