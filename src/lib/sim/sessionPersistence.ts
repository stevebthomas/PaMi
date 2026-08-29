import { useSimStore } from "@/store/simStore";
import { useTaskflowStore } from "@/store/taskflowStore";
import { initialStateBag } from "@/lib/sim/types";
import type {
  AskClaudeMessage,
  ChannelId,
  DayScorecardRecord,
  Difficulty,
  EasterEggDiscovery,
  Evaluation,
  HelpQuery,
  Message,
  StateBag,
  Ticket,
} from "@/lib/sim/types";

/**
 * ============================================================================
 * localStorage SESSION PERSISTENCE — STOPGAP, NOT THE DURABLE LAYER
 * ============================================================================
 *
 * This module lets an in-progress sim session survive a browser refresh by
 * snapshotting simStore + taskflowStore to localStorage and rehydrating on
 * load. It is DELIBERATELY a stopgap:
 *
 *   - Same-browser, same-profile ONLY. It does NOT survive clearing site data
 *     / cache, a different browser, a different device, or private-mode limits.
 *   - It is best-effort: any localStorage failure (quota exceeded, disabled in
 *     private mode, SecurityError, SSR where `window` is undefined) degrades to
 *     NO persistence rather than breaking the sim. The zustand stores remain
 *     the single source of truth in memory; this is only a mirror of them.
 *
 * The durable, cross-device layer is FUTURE WORK (Supabase — see
 * src/lib/supabase/persist.ts). Do NOT mistake this module for that layer or
 * build cross-device assumptions on top of it.
 *
 * This is a SEPARATE concern from src/lib/sim/outcomeStore.ts (key
 * "pm-sim.dayOutcomes.v1"), which persists finished-day OUTCOME records for a
 * future Day 2 to read. This module persists the LIVE, mid-session state of
 * the current day. The two keys never overlap; leave outcomeStore untouched.
 * ============================================================================
 */

const STORAGE_KEY = "pm-sim.session.v1";

/** Bump when the SessionSnapshot shape changes in a way that makes an older
 * saved payload unsafe to rehydrate. On mismatch the old payload is discarded
 * and the session starts fresh (never a crash). */
const SCHEMA_VERSION = 1;

/** Debounce window for writes. This is a persistence-I/O debounce only — it
 * does NOT drive any sim/NPC behavior, so it does not fall under the project's
 * "no wall-clock timers" rule (which bans timers that advance the sim). Writes
 * are additionally flushed synchronously on pagehide/visibilitychange so a
 * refresh immediately after an action never loses that action. */
const WRITE_DEBOUNCE_MS = 300;

/**
 * The serialized snapshot. Sets are stored as arrays here and rehydrated back
 * to Sets on load. `stateBag` is snapshotted as a WHOLE OBJECT (not
 * key-by-key), so any new plain-JSON field added to StateBag later — e.g. the
 * existing commitmentLedger / pendingObligations arrays — persists and restores
 * automatically without this module needing an edit.
 */
interface SessionSnapshot {
  schemaVersion: number;
  sim: {
    sessionId: string;
    day: number;
    clockMinutes: number;
    started: boolean;
    dayComplete: boolean;
    messages: Message[];
    stateBag: StateBag;
    evaluations: Record<string, Evaluation>;
    helpQueries: HelpQuery[];
    dayRecords: DayScorecardRecord[];
    notesText: string;
    difficulty: Difficulty;
    easterEggsFound: EasterEggDiscovery[];
    askClaudeMessages: AskClaudeMessage[];
    activeChannel: ChannelId;
    // Sets, serialized as arrays:
    unreadChannels: ChannelId[];
    pendingResponseIds: string[];
    firedEventIds: string[];
  };
  taskflow: {
    tickets: Ticket[];
  };
}

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Builds a snapshot of the current live state of both stores. Excludes the
 * transient/in-flight fields (pendingReplyFrom, pendingReplyChannel,
 * rajFallbackInFlight, askClaudePending) — any in-flight async is dead after a
 * refresh, so those are never persisted and are reset to safe defaults on
 * restore. windowStore/costStore are intentionally out of scope. */
function buildSnapshot(): SessionSnapshot {
  const sim = useSimStore.getState();
  const taskflow = useTaskflowStore.getState();
  return {
    schemaVersion: SCHEMA_VERSION,
    sim: {
      sessionId: sim.sessionId,
      day: sim.day,
      clockMinutes: sim.clockMinutes,
      started: sim.started,
      dayComplete: sim.dayComplete,
      messages: sim.messages,
      stateBag: sim.stateBag,
      evaluations: sim.evaluations,
      helpQueries: sim.helpQueries,
      dayRecords: sim.dayRecords,
      notesText: sim.notesText,
      difficulty: sim.difficulty,
      easterEggsFound: sim.easterEggsFound,
      askClaudeMessages: sim.askClaudeMessages,
      activeChannel: sim.activeChannel,
      unreadChannels: [...sim.unreadChannels],
      pendingResponseIds: [...sim.pendingResponseIds],
      firedEventIds: [...sim.firedEventIds],
    },
    taskflow: {
      tickets: taskflow.tickets,
    },
  };
}

/** Once true, all writes become no-ops. Set by resetSession() so the
 * pagehide/visibilitychange flush that fires during its reload can't re-persist
 * the still-in-memory session and silently undo the reset. */
let suspended = false;

/** Serializes and writes the current state immediately. All failures degrade
 * to a silent no-op — persistence is never allowed to break the sim. */
function persistNow(): void {
  if (suspended) return;
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSnapshot()));
  } catch {
    // Quota exceeded / private-mode / SecurityError — degrade to no
    // persistence rather than throwing into a store subscriber.
  }
}

let debounceHandle: ReturnType<typeof setTimeout> | null = null;
function scheduleWrite(): void {
  if (!hasWindow()) return;
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => {
    debounceHandle = null;
    persistNow();
  }, WRITE_DEBOUNCE_MS);
}

/** Flush any pending debounced write synchronously (used on page hide/unload
 * so a refresh right after an action can't lose it). */
function flushWrite(): void {
  if (debounceHandle) {
    clearTimeout(debounceHandle);
    debounceHandle = null;
  }
  persistNow();
}

/** Removes the saved session. Best-effort; safe to call anywhere. Used both
 * to discard a corrupt/incompatible payload during restore (persistence keeps
 * running afterward so the fresh session still saves) and by resetSession
 * below. */
export function clearSession(): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

/** Dev "start over" affordance (see window.resetSimSession in Desktop.tsx):
 * permanently suspends persistence for THIS page instance, wipes the saved
 * session, then reloads into a fresh one. Suspending first is essential — the
 * reload triggers the pagehide flush, which would otherwise immediately
 * re-persist the still-in-memory (started) session and undo the wipe. The
 * fresh page load starts a brand-new module instance with suspended=false, so
 * the new session persists normally. */
export function resetSession(): void {
  suspended = true;
  clearSession();
  if (hasWindow()) window.location.reload();
}

let restoreAttempted = false;
let restoredStartedSession = false;

/**
 * Attempts to hydrate both stores from a saved snapshot. Returns true iff a
 * genuinely STARTED session was restored (the caller uses this to skip
 * onboarding and land directly on the resumed desktop).
 *
 * Runs at most once (module-guarded) so React StrictMode's double-invocation
 * in dev, or a stray re-call, is harmless. This hydrates the zustand stores
 * SYNCHRONOUSLY, so it completes before any advanceClock can run (advanceClock
 * is re-entrant and only triggered by user actions / startDay, both of which
 * happen after this returns).
 *
 * Any corrupt, unparseable, or schema-mismatched payload is discarded and the
 * session starts fresh — never a crash.
 */
export function restoreSession(): boolean {
  if (restoreAttempted) return restoredStartedSession;
  restoreAttempted = true;

  if (!hasWindow()) return false;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as Partial<SessionSnapshot> | null;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.schemaVersion !== SCHEMA_VERSION ||
      !parsed.sim ||
      typeof parsed.sim.sessionId !== "string"
    ) {
      // Corrupt or from an incompatible schema — discard, start fresh.
      clearSession();
      return false;
    }

    const s = parsed.sim;

    // Only resume a session the player actually started. A snapshot written
    // during onboarding (started === false) is treated as "no session yet":
    // the player still gets the fresh onboarding flow.
    if (!s.started) return false;

    useSimStore.setState({
      // Restore the ORIGINAL sessionId — outcomeStore dedupes saved day
      // outcomes by sessionId + day, so a fresh id here would fork the session
      // identity on every refresh.
      sessionId: s.sessionId,
      day: s.day,
      clockMinutes: s.clockMinutes,
      started: s.started,
      dayComplete: s.dayComplete,
      messages: s.messages ?? [],
      // Merge over initialStateBag so an older snapshot missing a
      // later-added StateBag field still gets that field's default rather than
      // undefined. Saved values win over defaults.
      stateBag: { ...initialStateBag, ...(s.stateBag ?? {}) },
      evaluations: s.evaluations ?? {},
      helpQueries: s.helpQueries ?? [],
      dayRecords: s.dayRecords ?? [],
      notesText: s.notesText ?? "",
      difficulty: s.difficulty ?? "easy",
      easterEggsFound: s.easterEggsFound ?? [],
      askClaudeMessages: s.askClaudeMessages ?? [],
      activeChannel: s.activeChannel ?? "general",
      // Arrays -> Sets.
      unreadChannels: new Set(s.unreadChannels ?? []),
      pendingResponseIds: new Set(s.pendingResponseIds ?? []),
      firedEventIds: new Set(s.firedEventIds ?? []),
      // Transient/in-flight fields: any async that was mid-flight before the
      // refresh is dead, so reset these to safe defaults rather than restoring.
      pendingReplyFrom: null,
      pendingReplyChannel: null,
      rajFallbackInFlight: false,
      askClaudePending: false,
    });

    useTaskflowStore.setState({
      tickets: parsed.taskflow?.tickets ?? [],
    });

    restoredStartedSession = true;
    return true;
  } catch {
    // Unparseable / unexpected shape — discard and start fresh.
    clearSession();
    return false;
  }
}

let persistenceStarted = false;

/** Subscribes to both stores so any state change (player/NPC message, clock
 * advance, day completion, ticket move, etc.) schedules a debounced write.
 * Idempotent — safe to call from an effect that may run more than once. */
export function startSessionPersistence(): void {
  if (persistenceStarted) return;
  if (!hasWindow()) return;
  persistenceStarted = true;

  useSimStore.subscribe(scheduleWrite);
  useTaskflowStore.subscribe(scheduleWrite);

  // Flush synchronously when the tab is being hidden or unloaded, so a refresh
  // during the debounce window still captures the latest action.
  window.addEventListener("pagehide", flushWrite);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWrite();
  });
}
