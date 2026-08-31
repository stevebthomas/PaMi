import type { DayOutcome } from "./types";

/**
 * Minimal localStorage-backed persistence for DayOutcome records: see
 * DayOutcome's doc comment in types.ts for what the shape is and why it
 * exists. This is the layer that actually works today (there's no
 * zustand `persist` middleware anywhere in this app, and Supabase writes
 * currently fail under RLS, see src/lib/supabase/persist.ts).
 *
 * Nothing in the app UI reads `loadDayOutcomes` yet (no Day 2 exists to
 * consume a previous day's outcome). It's exported now so the data
 * survives page reloads and can be wired into a future day's logic
 * without having to add the storage layer at the same time.
 *
 * Every read/write is wrapped in try/catch: `localStorage` is undefined
 * during SSR and in headless test scripts (see scripts/test-day-outcome.ts,
 * which runs outside a browser), and can also throw in private-browsing
 * modes or when the quota is exceeded. All of those are silent no-ops here:
 * this store is a best-effort mirror of state that already lives
 * correctly in the zustand store, never a required read path.
 */

const STORAGE_KEY = "pm-sim.dayOutcomes.v1";

interface StoredDayOutcome {
  sessionId: string;
  savedAt: string;
  outcome: DayOutcome;
}

function readAll(): StoredDayOutcome[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saves a DayOutcome to localStorage, deduped by `sessionId + outcome.day`:
 * a second save for the same session/day (e.g. the coordination-score
 * merge updating `outcome.scores`/`overall` after the record was first
 * created) overwrites the existing entry in place rather than appending a
 * duplicate. `sessionId` is the caller's own session id (simStore.ts passes
 * its existing `sessionId` state, the same one used for
 * logHelpQueryToSupabase); this module doesn't mint or cache one of its
 * own.
 */
export function saveDayOutcome(sessionId: string, outcome: DayOutcome): void {
  try {
    const existing = readAll();
    const idx = existing.findIndex((r) => r.sessionId === sessionId && r.outcome.day === outcome.day);
    const record: StoredDayOutcome = { sessionId, savedAt: new Date().toISOString(), outcome };
    if (idx === -1) {
      existing.push(record);
    } else {
      existing[idx] = record;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // Silent no-op: see module doc comment (SSR, headless scripts,
    // private mode, or quota exceeded).
  }
}

/** Returns every DayOutcome saved so far (across sessions/days). Not read
 * anywhere in the app UI yet: see module doc comment. */
export function loadDayOutcomes(): DayOutcome[] {
  try {
    return readAll().map((r) => r.outcome);
  } catch {
    return [];
  }
}
