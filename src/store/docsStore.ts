import { create } from "zustand";
import { docWindowId, isDocWindowId, useWindowStore, type WindowId } from "@/store/windowStore";

/**
 * Docs launch plumbing: the dock-bounce animation flags plus the queue of docs
 * Desktop should open into their own windows.
 *
 * Each document now opens as its OWN independent window (keyed `doc:${docId}`
 * in windowStore) rather than a pane inside a shared Docs window. windowStore's
 * map is the single source of truth for which docs are open; this store owns
 * only the launch choreography (bounce + busy cursor) and hands Desktop the
 * docIds to open — Desktop is the only caller of openWindow with real desk
 * bounds, so it, not this store, actually creates the windows.
 *
 * NOT PERSISTED, by design: like windowStore and costStore, this is transient
 * UI plumbing (an animating launch, a busy cursor), not sim state worth
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

/** Is any Docs UI already on screen — the library window OR any open document
 * window? When something is already visible we skip the launch bounce and open
 * the new doc immediately; the bounce is reserved for launching the Docs
 * experience from cold (a chip clicked with nothing docs-related open). */
function isDocsUiVisible(): boolean {
  const wins = useWindowStore.getState().windows;
  if (wins.docs) return true;
  return Object.keys(wins).some((id) => isDocWindowId(id as WindowId));
}

interface DocsStoreState {
  /** True while the dock-bounce launch animation is running (the Docs icon
   * hops and the cursor reads busy). */
  launching: boolean;
  /** DocIds captured DURING an in-flight bounce, held until it finishes. A
   * cold-launch chip click seeds this; re-entrant clicks (double-tap, or a
   * second chip within the ~900ms) append here so every requested doc opens
   * together as the bounce completes, rather than one window popping mid-bounce.
   * Internal buffer; flushed into pendingOpenDocIds by the launch timer. */
  launchDocIds: string[];
  /** DocIds Desktop should open into their own windows NOW. Desktop (the only
   * caller of openWindow with real desk bounds) watches this, opens a
   * `doc:${docId}` window per id (centered/cascaded like every other window),
   * then drains it via clearPendingOpen. */
  pendingOpenDocIds: string[];

  /** Single entry point for both the Chattr attachment chip and the Docs
   * library tile: open `docId` in its own window.
   *   - already open       -> bring that doc's window to front (no duplicate).
   *   - Docs UI on screen   -> open the doc window immediately, no bounce.
   *   - nothing docs visible -> play the ~900ms dock-bounce, then open it.
   * recordDocOpened wiring lives at the call sites and is untouched. */
  openDocRequest: (docId: string) => void;
  /** Desktop drains the open queue once it has actually opened the windows. */
  clearPendingOpen: () => void;
}

/** Toggle the busy-pointer class on <body>. Guarded for SSR (no document) and
 * idempotent, so it can never strand the cursor. */
function setBusyCursor(on: boolean): void {
  if (typeof document === "undefined") return;
  document.body.classList.toggle(BUSY_CURSOR_CLASS, on);
}

export const useDocsStore = create<DocsStoreState>((set, get) => ({
  launching: false,
  launchDocIds: [],
  pendingOpenDocIds: [],

  openDocRequest: (docId) => {
    const store = useWindowStore.getState();
    const wid = docWindowId(docId);

    // Already open: just resurface that doc's own window, no duplicate window,
    // no bounce. Matches the one-window-per-key convention.
    if (store.windows[wid]) {
      store.bringToFront(wid);
      return;
    }

    // Docs already on screen (library or another doc window): open this doc's
    // window immediately, no launch bounce. Routed through pendingOpenDocIds so
    // Desktop opens it with real desk bounds.
    if (isDocsUiVisible()) {
      set((s) =>
        s.pendingOpenDocIds.includes(docId)
          ? s
          : { pendingOpenDocIds: [...s.pendingOpenDocIds, docId] }
      );
      return;
    }

    // Re-entrancy guard: a launch bounce is already animating. Don't start a
    // second bounce or a second busy-cursor toggle (this is what keeps the
    // cursor leak-proof if a chip is clicked twice). Buffer this doc so it
    // opens together with the in-flight launch when the timer fires.
    if (get().launching) {
      set((s) =>
        s.launchDocIds.includes(docId)
          ? s
          : { launchDocIds: [...s.launchDocIds, docId] }
      );
      return;
    }

    // Cold launch: play the dock-bounce, buffer this doc, then flush every
    // buffered doc into the open queue once the bounce completes.
    set({ launching: true, launchDocIds: [docId] });
    setBusyCursor(true);
    setTimeout(() => {
      setBusyCursor(false);
      set((s) => ({
        launching: false,
        launchDocIds: [],
        pendingOpenDocIds: [
          ...s.pendingOpenDocIds,
          ...s.launchDocIds.filter((id) => !s.pendingOpenDocIds.includes(id)),
        ],
      }));
    }, LAUNCH_MS);
  },

  clearPendingOpen: () => set({ pendingOpenDocIds: [] }),
}));
