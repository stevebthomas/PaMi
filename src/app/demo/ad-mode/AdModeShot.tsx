"use client";
/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL AD/GAME CONTENT — safe to delete after ad shoot is done.
 *
 * The ad-mode engine and desktop layout.
 *
 * THE AD PLAYS ITSELF, HANDS-FREE. On mount the take starts at beat 0 and runs
 * to the end with nobody touching anything: a beat plays its entry hold, its
 * exchange, its autos and its scripted assignment, and the moment its LAST
 * chain finishes the next beat is queued one GAP_MS later (see
 * `scheduleAutoAdvance`). That between-beats gap is the same flat two seconds
 * the blanket rule gives every other pair of visible motions, so the seam
 * between two beats is paced exactly like a seam inside one. The FINAL beat
 * (the eval screen) completes and STAYS: there is no wrap-around.
 *
 * NO BEAT WAITS FOR A HUMAN. The two Office beats make their own pick through
 * `autoAssign`, every player line is typed by the engine through the real
 * composer, and nothing anywhere awaits a click — so a hands-free run cannot
 * deadlock. The actor may still take any of it over on camera (assigning by
 * hand, opening Pulse from the chip, dragging windows); doing so composes with
 * playback instead of stopping it.
 *
 * THE HOTKEYS ARE UNCHANGED, and they always win over the timer: every one of
 * them retires the session the pending advance was scheduled under, and the
 * advance re-checks that identity before it fires, so a press and the timer can
 * never both move the beat index.
 *
 * A BEAT ARRIVING DOES NOT CUT. Every beat carries an ENTRY HOLD (one GAP_MS —
 * see the GAP_MS block in script.ts, which is now the single pacing number for
 * the whole ad): the beat is selected (by the auto-advance, or by a press), the
 * PREVIOUS beat's finished frame — clock included — stays on camera for that
 * hold, and only then does the new beat's patch land and its own exchange/autos
 * begin. It is a hold, not a delay before an advance: the index has already
 * moved, and ArrowRight during the hold still lands the whole beat and steps
 * forward off the one press.
 *
 * Hotkeys (global, route level). Same three, same meanings; they now interrupt
 * a movie that is already running rather than driving a still one:
 *   ArrowRight NEXT BEAT, always, in ONE press, EARLY. If the beat is
 *              mid-playback the press first fast-forwards it — the player's
 *              line is typed out and sent instantly, every indicator is
 *              skipped, every message and banner of the beat lands at once —
 *              and then advances off the same press. Animations never block or
 *              delay the advance. During the between-beats gap it simply takes
 *              the jump the timer was about to take, now. Clamps at the last
 *              beat.
 *   ArrowLeft  BACK ONE BEAT, for retakes; playback then RESUMES from the
 *              re-entered beat on its own. Cancels whatever is playing, rebuilds
 *              the scene by FOLDING the completed state of beats 0..n-2 (see
 *              script.ts's completeStep/completedTimeline: every delay treated
 *              as zero, no banners, no timers) plus a from-scratch replay of the
 *              real window cascade, then enters beat n-1 normally so its
 *              animations play again from the top. Mid-playback it is the same
 *              action — cancel and re-enter the previous beat — because the fold
 *              is authoritative, so a half-played beat has nothing worth
 *              salvaging. No-op at beat 0.
 *   r / R      cancel every timer and animation, reset to beat 0 — the load
 *              frame, which paints instantly — and START PLAYING AGAIN from the
 *              top, with the first auto-advance one GAP_MS later.
 *
 * ONE capture-phase listener implements all three, deliberately:
 *   - CAPTURE, because during a player line the real composer has focus (so the
 *     native caret blinks at the end of the text) and a bubble listener would be
 *     opted out by the text-field guard. Both arrows are consumed there
 *     (preventDefault + stopPropagation) so the focused composer never eats
 *     them.
 *   - ONE listener, because a press must resolve to exactly one action. It reads
 *     the "is a timeline running" flag once, up front, before anything mutates,
 *     and branches on that snapshot. Splitting this across a capture and a
 *     bubble listener does NOT work: the browser drains microtasks between
 *     listener invocations, so a fast-forward done in capture let the timeline's
 *     chains settle and go idle before the bubble handler read the flag, and
 *     that handler then took the idle branch off the very same keypress.
 *   - the text-field guard still applies whenever no timeline is running, so
 *     typing in the eval screen's Reason / Good response inputs, or in the
 *     composer between beats, can never drive or reset a take.
 *
 * The CHROME here is the real app's: the real StatusBar (difficulty pill, +15m,
 * battery meter, clock), the real Wallpaper and ambient time-of-day tint, the
 * real DesktopWindow shell (draggable title bar, resize grip, real AppIcon) at
 * positions computed by the real cascade placement, and the real Taskbar dock
 * with every app in the shipping order. All of it is rendered through those
 * components' presentational cores and fed from script.ts, so nothing on this
 * route reads or writes a real store, and the system controls are deliberately
 * inert.
 *
 * WINDOWS. Each beat declares an ordered OPEN WINDOW SET (see `windows` in
 * script.ts) rather than one front app, and the desk holds them all at once.
 * Placement is the product's own: windowStore's pure `clampSpawnSize` /
 * `cascadePlacement` against the live desk box, with the shipping
 * APP_DEFAULT_SIZE / APP_MIN_SIZE tables, so several windows spread with
 * exactly the stagger the live app gives them (see windowLayout.ts). The layout
 * is demo-local React state, never the window store. Windows are draggable and
 * resizable on camera; clicking a window or its dock tile raises it.
 *
 * Nothing on this route is real: the clock, the messages, the Pulse numbers,
 * the unread badge and the scorecard are all read straight out of script.ts.
 * Hardcoded for filming, no real logic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wallpaper } from "@/components/desktop/Wallpaper";
import { StatusBarView } from "@/components/desktop/StatusBar";
import { TaskbarView } from "@/components/desktop/Taskbar";
import { DesktopWindowView } from "@/components/desktop/DesktopWindow";
import { AppIcon } from "@/components/shared/AppIcon";
import { APP_MIN_SIZE, type AppId } from "@/components/desktop/appWindows";
import type { WindowSizeClamp } from "@/store/windowStore";
import { getAmbientTint, getBatteryLevel } from "@/lib/sim/timeOfDay";
import {
  EMPTY_LAYOUT,
  focusWindow,
  moveWindow,
  resizeWindow,
  syncLayout,
  type DemoWindowLayout,
  type DeskSize,
} from "./windowLayout";
import { EvalScreen, type Trace } from "../shared/EvalScreen";
import { Banners, type BannerItem } from "./Banners";
import {
  ScriptedChattr,
  ScriptedDocs,
  ScriptedOffice,
  ScriptedPulse,
  ScriptedTaskflow,
} from "./ScriptedApps";
import { Day2Transition, ScorecardReveal } from "./ScorecardReveal";
import {
  EVAL_BATCH_TOTAL,
  EVAL_DOC_TITLE,
  GAP_MS,
  PULSE_CHIP_PRESS_MS,
  PULSE_CHIP_PRESS_STEP_ID,
  entryHoldMs,
  INITIAL_SCENE,
  PLAYER_TYPING,
  SCRIPT,
  clockLabel,
  completedTimeline,
  dayProgress,
  landLine,
  npcIndicatorMs,
  playerCharDelayMs,
  type AssignReaction,
  type BannerSpec,
  type ChannelId,
  type ExchangeEvent,
  type FrontApp,
  type NpcLine,
  type PlayerLine,
  type PlayerTypingConfig,
  type SceneState,
} from "./script";

/** The single eval trace the ad lands on. The counter reads "trace 3 of 30",
 * the same EVAL_BATCH_TOTAL the Day-2 document states, so the two surfaces
 * agree on how big the batch is. Hardcoded for filming, no real eval behind
 * it. */
const AD_TRACES: Trace[] = [
  {
    no: 3,
    meta: "listing-assistant · draft · 9:04 AM",
    sample:
      "Vintage-Inspired Countertop Companion. Barely Used, Full of Character! This retro chrome toaster still toasts like it means it, and honestly, this toaster has seen things. A statement piece for any counter, priced to move.",
  },
];

/**
 * A banner's on-screen DWELL, and its exit fade.
 *
 * FLAGGED EXCEPTION to the blanket GAP_MS rule (exception 3 in script.ts's
 * GAP_MS block). This is not the gap between two motions — it is how long one
 * card stays up — and it deliberately OUTLASTS GAP_MS: banners now arrive
 * exactly GAP_MS apart in the STACKING burst, so a 2000ms dwell would start
 * banner N leaving in the very frame banner N+1 arrives, and the stack would
 * never be seen to push (see Banners.tsx). 2600 leaves 600ms of overlap, which
 * is what puts two cards on screen together and makes the push readable.
 */
const BANNER_HOLD_MS = 2600;
const BANNER_EXIT_MS = 300;

/** The dock tiles that actually open/raise a window on click. Every other
 * real app is still on the dock (TaskbarView renders the full shipping list in
 * the shipping order) but has no scripted body, so its tile no-ops. */
const SCRIPTED_APPS = new Set<string>(["chattr", "pulse", "taskflow", "office", "docs"]);

/** Real Desktop titles each window bar with the app's name in caps — except a
 * DOCUMENT window, which the real Desktop titles with the doc's own title (see
 * its `isDocWindowId` branch), so the eval batch carries its title verbatim. */
const WINDOW_TITLE: Record<FrontApp, string> = {
  chattr: "CHATTR",
  pulse: "PULSE",
  taskflow: "TASKFLOW",
  office: "OFFICE",
  docs: EVAL_DOC_TITLE,
};

/* -------------------------------------------------------------- scheduler */

/**
 * One beat's playback. Every scripted delay in the beat — per-character typing,
 * the pause before Enter, an NPC's indicator hold, an `auto`'s offset, an
 * assign reaction's lead-in — goes through `sleep(session, …)`, which is the
 * single place a timer is created. That buys the two control semantics for
 * free:
 *
 *   cancel (reset, or leaving the beat) flips `cancelled`, clears every live
 *   timer and releases every pending sleep, so each chain wakes, sees the flag
 *   and unwinds without touching scene state — no orphan timer, no half-applied
 *   beat.
 *
 *   fast-forward flips `fast` and releases every pending sleep, so every
 *   remaining step of the beat runs back-to-back: subsequent sleeps resolve
 *   instantly (no timer is created at all) and the typing loop jumps straight to
 *   the full string. `settleSession` then awaits the chains, which is what lets
 *   ONE ArrowRight land the whole beat and advance off the same press — the
 *   advance is sequenced after the last chain, never after a timer.
 *
 * A session is created per beat and shared by every chain in it (the beat's
 * exchange, each `auto`, the scripted auto-assign and any assign reaction fired
 * during the beat), so one ArrowRight flushes all of them at once.
 */
type Session = {
  /** Which beat/run this session belongs to, so a chain finishing can only
   * report against the beat it actually ran in. */
  beat: number;
  run: number;
  cancelled: boolean;
  fast: boolean;
  /** Release callbacks for every in-flight sleep. */
  wakes: Set<() => void>;
  /** Live timer ids, so cancel leaves nothing behind. */
  timers: Set<number>;
  /** Chains still running under this session. */
  running: number;
  /** Every chain started under this session, so a fast-forward can await them
   * all before advancing. Drained by `settleSession`. */
  chains: Promise<unknown>[];
};

function createSession(beat: number, run: number): Session {
  return {
    beat,
    run,
    cancelled: false,
    fast: false,
    wakes: new Set(),
    timers: new Set(),
    running: 0,
    chains: [],
  };
}

function sleep(session: Session, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (session.cancelled || session.fast || ms <= 0) {
      resolve();
      return;
    }
    let id = 0;
    const wake = () => {
      window.clearTimeout(id);
      session.timers.delete(id);
      session.wakes.delete(wake);
      resolve();
    };
    id = window.setTimeout(wake, ms);
    session.timers.add(id);
    session.wakes.add(wake);
  });
}

/** Clears every live timer and releases every pending sleep, so the chains
 * resume immediately (and, when cancelling, unwind on their own flag check). */
function releaseAll(session: Session) {
  session.timers.forEach((id) => window.clearTimeout(id));
  session.timers.clear();
  const wakes = Array.from(session.wakes);
  session.wakes.clear();
  wakes.forEach((wake) => wake());
}

/**
 * Resolves once every chain of a session has run out. Called only after `fast`
 * is set, where each remaining sleep resolves immediately and no new timer can
 * be created, so this settles within a few microtasks — before the browser
 * paints, and without a single timer in the path to the advance.
 *
 * The loop re-drains because a chain can start another one while it unwinds
 * (an `auto` that owns an exchange, the auto-assign that owns its reaction).
 */
async function settleSession(session: Session): Promise<void> {
  while (session.chains.length > 0) {
    const pending = session.chains.splice(0, session.chains.length);
    await Promise.allSettled(pending);
  }
}

export default function AdModeShot() {
  const [scene, setScene] = useState<SceneState>(INITIAL_SCENE);
  const [stepIndex, setStepIndex] = useState(0);
  const [banners, setBanners] = useState<BannerItem[]>([]);
  /** Where each open window sits. Demo-local; see windowLayout.ts. */
  const [layout, setLayout] = useState<DemoWindowLayout>(EMPTY_LAYOUT);
  /** The live desk box, measured off the same element windows are positioned
   * in, so the real cascade math is fed the real dimensions. */
  const [desk, setDesk] = useState<DeskSize | null>(null);
  /** Bumped on reset so keyed overlays remount and replay their animations. */
  const [runKey, setRunKey] = useState(0);
  /**
   * The "Open Pulse" chip's scripted pressed state. PRESENTATION ONLY — it is
   * React state here rather than a SceneState field precisely so it stays out
   * of the fold: no beat's completed result records whether a button was shown
   * depressed for 300ms.
   */
  const [pulseChipPressed, setPulseChipPressed] = useState(false);
  /**
   * Operator-HUD "typing…" state, and the thing ArrowRight branches on. Derived
   * rather than stored: a beat that declares an exchange or autos IS running a
   * timeline from the moment it is entered, and only the two events that can
   * change that — the last chain of a beat finishing, and an assign reaction
   * starting one later — write this override. That keeps the flag out of the
   * effect body (no setState-in-effect) while staying exact.
   */
  const [activeOverride, setActiveOverride] = useState<{
    beat: number;
    run: number;
    active: boolean;
  } | null>(null);

  // stepIndex mirrored into a ref so the keydown handler and the Office assign
  // handler can read the current beat without re-binding on every step.
  const stepRef = useRef(0);
  /** The CURRENT beat's playback session (see Session above). */
  const sessionRef = useRef<Session | null>(null);
  /** Whether a scripted timeline is running, for the keydown handlers. Written
   * by the three places that know: a chain starting, the last chain of a
   * session finishing, and a session being cancelled. */
  const timelineActiveRef = useRef(false);
  /** Banner dismiss timers. Cleared on reset only: clearing them on a step
   * change would strand a banner on screen forever. */
  const bannerTimers = useRef<number[]>([]);
  /**
   * ONE assignment per beat entry. Whichever gets there first — the actor
   * clicking an Assign button on camera, or the beat's scripted `autoAssign`
   * timer — sets this and the other becomes a no-op, so the card can never be
   * assigned twice and the reaction can never double-fire. Cleared when a beat
   * is entered (including on a retake).
   */
  const assignClaimed = useRef(false);
  const bannerId = useRef(0);
  /** The real composer's textarea, for focus/caret/synthetic-Enter. */
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  /** The desk element: the drag/resize bounds, exactly like Desktop's own
   * containerRef. */
  const deskRef = useRef<HTMLDivElement>(null);
  /** The player line the next scripted send should post. Read by the composer's
   * onSend, so the send path never has to inspect the textarea's value. */
  const pendingSendRef = useRef<PlayerLine | null>(null);
  /** The state the CURRENT beat's patch should be applied to when its entry
   * hold expires. Only a retake sets it (the rebuilt fold); forward, the patch
   * applies to whatever is on screen, so this stays null. */
  const entryBaseRef = useRef<SceneState | null>(null);
  /** Whether Pulse is on the desk, readable from inside a timeline chain (which
   * closes over a stale `scene`). Only the scripted chip press needs it: it is
   * skipped when the actor already opened Pulse by hand. */
  const pulseOpenRef = useRef(false);
  /** The pending BETWEEN-BEATS advance (see scheduleAutoAdvance). At most one
   * exists at a time, and every control path clears it. */
  const autoAdvanceTimer = useRef<number | null>(null);

  const pushBanner = useCallback((spec: BannerSpec) => {
    const id = bannerId.current++;
    setBanners((prev) => [{ ...spec, id, leaving: false }, ...prev]);
    bannerTimers.current.push(
      window.setTimeout(() => {
        setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, leaving: true } : b)));
      }, BANNER_HOLD_MS - BANNER_EXIT_MS),
      window.setTimeout(() => {
        setBanners((prev) => prev.filter((b) => b.id !== id));
      }, BANNER_HOLD_MS),
    );
  }, []);

  /* ---------------------------------------------------- auto-advance timer */

  /**
   * PLAYBACK IS HANDS-FREE. Cancels the pending between-beats advance. Every
   * hotkey action, every reset and the unmount go through here (via `enterStep`
   * or `cancelSession`), so an operator's press can never race the timer that
   * was about to make the same jump. Manual DESK interaction — dragging a
   * window, clicking a dock tile or a channel — deliberately does NOT come
   * through here: the actor can browse while the movie runs and it keeps
   * rolling.
   */
  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceTimer.current !== null) {
      window.clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
  }, []);

  /**
   * SELECTS a beat. It deliberately does NOT put the beat on screen.
   *
   * The visible change is the beat's `apply` patch, and that is now deferred by
   * the beat's ENTRY HOLD (`entryHoldMs` in script.ts): the timeline effect
   * below applies it once the hold expires. So a press moves the HUD and starts
   * the clock on the hold, while the camera keeps looking at the PREVIOUS
   * beat's finished frame — including its status-bar clock, which now flips
   * with the beat's landing rather than on the keypress.
   *
   * The single entry point, so arriving by ArrowRight and arriving by ArrowLeft
   * are the same event as far as the timeline effect is concerned: it re-runs
   * on the index change either way and plays the beat, hold included, from the
   * top.
   *
   * `from` is the state the step will patch (the retake's rebuilt fold). It is
   * ALSO what has to be on camera during a retake's hold — the previous beat's
   * rebuilt end state — so it goes up now and is patched when the hold expires.
   * Without it the step patches whatever is on screen, which is the forward
   * case and already the right picture.
   */
  const enterStep = useCallback(
    (index: number, from?: SceneState) => {
      // Selecting a beat — by hotkey OR by the auto-advance itself — retires
      // any queued advance, so the movie can never step twice off one
      // completion.
      clearAutoAdvance();
      stepRef.current = index;
      // A beat being re-entered may still carry the previous visit's HUD
      // verdict under the same beat/run key, which would read as "already
      // finished".
      setActiveOverride(null);
      setStepIndex(index);
      entryBaseRef.current = from ?? null;
      if (from) setScene(from);
    },
    [clearAutoAdvance],
  );

  const advance = useCallback(() => {
    const next = stepRef.current + 1;
    if (next >= SCRIPT.length) return;
    enterStep(next);
  }, [enterStep]);

  /**
   * THE BETWEEN-BEATS GAP. Scheduled by `runChain` the moment a beat's LAST
   * chain finishes — entry hold, exchange, autos, auto-assign and any reaction
   * all done — so the next beat lands one GAP_MS later and the whole ad plays
   * itself. That gap is the same flat two seconds every other pair of motions
   * gets: the beat's final frame is a motion, and the next beat landing is the
   * next one.
   *
   * IT CANNOT DOUBLE-FIRE OR OVERTAKE THE OPERATOR. Three guards, in order:
   *   - only one timer exists at a time (`clearAutoAdvance` first);
   *   - the LAST beat schedules nothing, so the ad ends on the eval screen and
   *     stays there rather than wrapping around;
   *   - the callback re-checks SESSION IDENTITY before advancing. Every
   *     ArrowRight/ArrowLeft/R retires the session it was scheduled under (a
   *     new one is created per beat entry), so a timer that somehow survived a
   *     manual jump wakes, sees a different current session or a different beat
   *     on the HUD, and retires without touching anything.
   */
  const scheduleAutoAdvance = useCallback(
    (session: Session) => {
      clearAutoAdvance();
      // The final beat completes and HOLDS. No wrap-around, ever.
      if (session.beat >= SCRIPT.length - 1) return;
      autoAdvanceTimer.current = window.setTimeout(() => {
        autoAdvanceTimer.current = null;
        if (sessionRef.current !== session || session.cancelled) return;
        if (stepRef.current !== session.beat) return;
        advance();
      }, GAP_MS);
    },
    [advance, clearAutoAdvance],
  );

  /* ------------------------------------------------------- timeline chains */

  const runChain = useCallback(
    (session: Session, body: () => Promise<void>) => {
      session.running += 1;
      timelineActiveRef.current = true;
      // The beat is playing again, so any advance queued by an earlier
      // completion is void. This is what keeps a LATE chain — an assign
      // reaction the actor triggers by hand after the beat's own chains have
      // run out — from being cut off by the auto-advance it just outlived.
      // Guarded on identity like everything else here: a chain belonging to a
      // RETIRED session must never cancel the current beat's queued advance,
      // because nothing would ever reschedule it and the movie would stall.
      if (sessionRef.current === session) clearAutoAdvance();
      const chain = body().finally(() => {
        session.running -= 1;
        // Only the CURRENT session may clear the HUD flag: a cancelled
        // session's chains unwinding must not stomp a freshly-started beat.
        if (session.running <= 0 && sessionRef.current === session) {
          timelineActiveRef.current = false;
          setActiveOverride({ beat: session.beat, run: session.run, active: false });
          // THE BEAT IS DONE: queue the next one. Same identity rule — a
          // retired session's chains unwinding must not drive playback.
          scheduleAutoAdvance(session);
        }
      });
      // Tracked so a fast-forward can await the whole beat (see
      // settleSession). allSettled is what consumes the rejection, so a
      // throwing chain surfaces as a failed take rather than an unhandled
      // rejection storm.
      session.chains.push(chain);
    },
    [clearAutoAdvance, scheduleAutoAdvance],
  );

  /**
   * The scripted send. This is the very handler MessageInputView's Enter branch
   * (and its Send button) calls, so the composer clears and the message appears
   * through exactly one code path. It appends to demo scene state and nothing
   * else: no store action, no API call.
   */
  const handleScriptedSend = useCallback(() => {
    const pending = pendingSendRef.current;
    // Nothing scripted is in flight (e.g. the actor typed into the composer
    // between beats): the real component's guards already ran, so just no-op.
    if (!pending) return;
    pendingSendRef.current = null;
    setScene((s) => landLine({ ...s, composer: "" }, pending));
    if (pending.banner) pushBanner(pending.banner);
  }, [pushBanner]);

  /** Sends through the real component: a synthetic Enter keydown on the real
   * textarea, which React routes to MessageInputView's own onKeyDown. */
  const submitScriptedLine = useCallback(() => {
    composerRef.current?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    // Filming safety net: if the composer isn't mounted (the actor switched
    // apps mid-line) the Enter never reached the component, so call the exact
    // same handler it would have. handleScriptedSend clears the pending ref, so
    // this can never double-post.
    if (pendingSendRef.current) handleScriptedSend();
  }, [handleScriptedSend]);

  const runPlayerLine = useCallback(
    async (session: Session, line: PlayerLine) => {
      const cfg: PlayerTypingConfig = { ...PLAYER_TYPING, ...(line.typing ?? {}) };
      pendingSendRef.current = line;
      // Focus the REAL textarea so the native caret blinks at the end of the
      // text while the characters land. The capture-phase hotkey listener is
      // what keeps the operator's hotkeys working while it holds focus.
      composerRef.current?.focus();

      for (let i = 0; i < line.text.length; i += 1) {
        if (session.cancelled) return;
        if (session.fast) break;
        const upTo = line.text.slice(0, i + 1);
        setScene((s) => ({ ...s, composer: upTo }));
        await sleep(session, playerCharDelayMs(line.text[i], cfg));
      }
      if (session.cancelled) return;

      // Covers both endings: the loop finished, or fast-forward broke out of it.
      setScene((s) => ({ ...s, composer: line.text }));
      await sleep(session, cfg.sendPauseMs);
      if (session.cancelled) return;
      submitScriptedLine();
      composerRef.current?.blur();
    },
    [submitScriptedLine],
  );

  const runNpcLine = useCallback(
    async (session: Session, line: NpcLine) => {
      // Flat GAP_MS for every line, unless the line pins its own hold (Theo's
      // away reply is the one that does). See script.ts's npcIndicatorMs.
      const hold = npcIndicatorMs(line);
      setScene((s) => ({ ...s, typing: { channel: line.channel, agentId: line.agentId } }));
      await sleep(session, hold);
      if (session.cancelled) return;
      // ONE state update clears the indicator and lands the line (plus the
      // line's own patch), so the indicator and the message it was announcing
      // can never be on screen at the same time.
      setScene((s) => landLine({ ...s, typing: null }, line));
      if (line.banner) pushBanner(line.banner);
    },
    [pushBanner],
  );

  /**
   * One exchange, played in order, with THE BLANKET GAP between its lines.
   *
   * Every line of an exchange is two visible motions (something starts — the
   * composer filling, or "X is typing…" — and then the message lands), and the
   * director's rule spaces motions flat: `runNpcLine`/`runPlayerLine` own the
   * start->land gap, and this loop owns the land->next-start one. So a
   * three-line exchange reads as start, land, pause, start, land, pause… all on
   * the same two-second metronome.
   *
   * `leadInMs` is the gap from whatever caused the exchange to its first line
   * starting. A STEP-level exchange is caused by the beat's patch landing, so
   * it passes GAP_MS. An exchange owned by an `auto` or an assign reaction
   * passes 0: that chain's own `delayMs` — itself a GAP_MS — already IS the gap
   * from the previous motion, and paying it twice would double-space those
   * beats (and desynchronise the STACKING burst's banner cadence).
   */
  const runExchange = useCallback(
    async (session: Session, events: ExchangeEvent[], leadInMs = 0) => {
      let gapMs = leadInMs;
      for (const event of events) {
        if (session.cancelled) return;
        if (gapMs > 0) {
          await sleep(session, gapMs);
          if (session.cancelled) return;
        }
        if (event.kind === "player") await runPlayerLine(session, event);
        else await runNpcLine(session, event);
        // Every line after the first is one flat gap behind the one that just
        // landed.
        gapMs = GAP_MS;
      }
    },
    [runPlayerLine, runNpcLine],
  );

  const cancelSession = useCallback(() => {
    // Cancelling the beat cancels its queued successor: reset, retake and
    // unmount all land here, and none of them may leave a timer behind.
    clearAutoAdvance();
    const session = sessionRef.current;
    sessionRef.current = null;
    timelineActiveRef.current = false;
    if (!session) return;
    session.cancelled = true;
    pendingSendRef.current = null;
    composerRef.current?.blur();
    // A cancel mid-press must not strand the chip depressed.
    setPulseChipPressed(false);
    releaseAll(session);
  }, [clearAutoAdvance]);


  /**
   * ArrowRight while a timeline is running: land the whole beat AND advance, off
   * the one press. `fast` + releaseAll makes every remaining sleep resolve
   * without a timer, `settleSession` waits for the chains that are unwinding
   * (microtasks only, so nothing paints in between), and the advance goes last
   * so the beat's final state is on screen underneath the next beat's patch.
   *
   * Sequencing the advance after the chains — rather than firing it in the same
   * synchronous breath — is what keeps this exact: advancing first would change
   * `stepIndex`, and the timeline effect's cleanup would cancel the very chains
   * that were mid-flush, dropping the tail of the beat.
   */
  const skipAndAdvance = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.cancelled) {
      advance();
      return;
    }
    session.fast = true;
    releaseAll(session);
    void settleSession(session).then(() => {
      // A reset (or a back-step) between the press and the flush retires this
      // session; that press has already been superseded.
      if (sessionRef.current === session) advance();
    });
  }, [advance]);

  /**
   * ArrowLeft: back one beat, for a retake.
   *
   * Deterministic by construction. Nothing about the beat being left is reused:
   * the session is cancelled, the scene is rebuilt from the pure fold of beats
   * 0..n-2 (every message landed, every patch applied, the right clock, no
   * banner and no timer), the window layer is re-placed from an empty layout by
   * replaying the real cascade over each of those beats' declared window sets,
   * and beat n-1 is then entered normally so its animations play from the top.
   * The fold reads the script's own step/auto/exchange/assign data, so there is
   * no second table of per-beat end states to keep in sync.
   */
  const goBack = useCallback(() => {
    const target = stepRef.current - 1;
    if (target < 0) return;
    cancelSession();
    // A retake starts on a clear desk: banners from the abandoned beat would
    // otherwise hang around over the rebuilt one.
    bannerTimers.current.forEach(clearTimeout);
    bannerTimers.current = [];
    setBanners([]);

    const prior = completedTimeline(target - 1);
    const base = prior.length > 0 ? prior[prior.length - 1] : INITIAL_SCENE;
    if (desk) {
      // Replayed only as far as beat n-2's END — which is exactly the frame the
      // retake now HOLDS on, because beat n-1's patch does not land until its
      // entry hold expires. Placing n-1's windows here instead would open them
      // during the hold, i.e. the jump cut the hold exists to remove; the sync
      // effect places them when the patch lands.
      const replayed = prior.reduce(
        (acc, s) => syncLayout(acc, s.windows, s.frontApp, desk),
        EMPTY_LAYOUT,
      );
      // One final sync against the frame actually going on screen. A no-op when
      // `prior` already ended there, and the thing that places beat 0's window
      // when `prior` is EMPTY (ArrowLeft all the way back): without it the desk
      // would stay blank, because the sync effect below is keyed on the SCENE
      // changing and going back to beat 0 does not change it.
      setLayout(syncLayout(replayed, base.windows, base.frontApp, desk));
    }
    enterStep(target, base);
  }, [cancelSession, desk, enterStep]);

  const reset = useCallback(() => {
    cancelSession();
    bannerTimers.current.forEach(clearTimeout);
    bannerTimers.current = [];
    assignClaimed.current = false;
    pendingSendRef.current = null;
    entryBaseRef.current = null;
    setPulseChipPressed(false);
    stepRef.current = 0;
    setActiveOverride(null);
    setStepIndex(0);
    setScene(INITIAL_SCENE);
    setBanners([]);
    // Wipes every placed window AND the cascade/z counters, so take two opens
    // Chattr dead-centre again rather than continuing the previous take's
    // cascade — and re-places beat 0's window set in the SAME update. Leaving
    // that to the sync effect below is not enough: that effect is keyed on the
    // scene changing, and resetting from an already-at-beat-0 take (a false
    // start, the most common reason to hit R) does not change it, so the desk
    // would come back empty.
    setLayout(
      desk ? syncLayout(EMPTY_LAYOUT, INITIAL_SCENE.windows, INITIAL_SCENE.frontApp, desk) : EMPTY_LAYOUT,
    );
    setRunKey((k) => k + 1);
  }, [cancelSession, desk]);

  // Mirror of "is Pulse on the desk", for the scripted chip press (see
  // pulseOpenRef). A plain projection of scene state, never a second source of
  // truth for it.
  useEffect(() => {
    pulseOpenRef.current = scene.windows.includes("pulse");
  }, [scene.windows]);

  /* -------------------------------------------------------- window layout */

  // Measure the desk. Same box Desktop measures (the padded, relatively
  // positioned area between the status bar and the dock), so cascadePlacement
  // gets exactly the dimensions the live app would hand it.
  useEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const measure = () => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      // Compare before setting so a ResizeObserver notification that didn't
      // actually change the box can't spin the layout effect below.
      setDesk((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Place the beat's declared window set. This is the sanctioned "synchronize
  // React state with an external system" shape: a window CANNOT be placed until
  // the desk has been measured out of the DOM (cascadePlacement needs real
  // dimensions), so the placement necessarily lands one pass after the scene
  // patch that declared it — the same one-frame ordering Desktop lives with
  // when it calls openWindow off containerRef. syncLayout is pure and returns
  // the SAME object when nothing moved, so this settles in a single pass (no
  // cascading renders) and is safe under strict mode's double-invoked updater.
  useEffect(() => {
    if (!desk) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayout((prev) => syncLayout(prev, scene.windows, scene.frontApp, desk));
  }, [scene.windows, scene.frontApp, desk]);

  /* ------------------------------------------------------------- hotkeys */

  useEffect(() => {
    /**
     * ONE listener, capture phase, for all three hotkeys. It has to be capture
     * because during a player line the real composer holds focus, and it has to
     * be a SINGLE listener because a press must resolve to exactly one action.
     *
     * A capture listener plus a separate bubble listener could not do that: the
     * browser drains the microtask queue between two listener invocations, so
     * fast-forwarding in the capture handler let the timeline's chains settle
     * (releaseAll -> the sleeps resolve -> the last chain's `finally` flips
     * timelineActiveRef to false) before the bubble handler read the flag, and
     * that handler then took the idle branch off the same keypress. Reading
     * `active` once, up front, before anything mutates, is what keeps the two
     * ArrowRight branches from ever both running.
     */
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const isNext = event.key === "ArrowRight";
      const isBack = event.key === "ArrowLeft";
      const isReset = event.code === "KeyR" || event.key === "r" || event.key === "R";
      if (!isNext && !isBack && !isReset) return;

      // Snapshot BEFORE any state mutation. Everything below branches on this
      // one value, so a press can never both skip and advance.
      const active = timelineActiveRef.current;

      // Idle: the original text-field guard applies, so typing in the eval
      // screen's Reason / Good response inputs (or in the composer between
      // beats) can never drive the take. While a timeline IS running, the
      // operator keeps every hotkey even though the composer has focus — that
      // is the whole reason this listener is on the capture phase.
      if (!active) {
        const target = event.target;
        if (target instanceof HTMLElement) {
          const tag = target.tagName;
          if (
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            tag === "SELECT" ||
            target.isContentEditable
          ) {
            return;
          }
        }
      }

      // Consumed here, in capture, so the focused composer (or anything else on
      // the desk) never sees an arrow key that belongs to the operator.
      event.preventDefault();
      event.stopPropagation();

      if (isNext) {
        // One press, one beat forward, whatever is playing.
        if (active) skipAndAdvance();
        else advance();
        return;
      }
      if (isBack) {
        // Same action either way: the rebuild is authoritative, so a
        // half-played beat has nothing to salvage first.
        goBack();
        return;
      }
      reset();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [advance, goBack, reset, skipAndAdvance]);

  /* --------------------------------------------------- the beat's timeline */

  /**
   * The tail of an assignment: the same reaction chain whether the assignment
   * came from the actor's click or the beat's own `autoAssign`, so the two
   * paths cannot drift.
   */
  const playAssignReaction = useCallback(
    async (session: Session, reaction: AssignReaction) => {
      await sleep(session, reaction.delayMs);
      if (session.cancelled) return;
      if (reaction.apply) setScene(reaction.apply);
      if (reaction.banner) pushBanner(reaction.banner);
      if (reaction.exchange) await runExchange(session, reaction.exchange);
    },
    [pushBanner, runExchange],
  );

  useEffect(() => {
    assignClaimed.current = false;
    const step = SCRIPT[stepIndex];
    const session = createSession(stepIndex, runKey);
    sessionRef.current = session;

    /**
     * The beat's own timelines, started only once the beat is VISIBLE (see the
     * entry chain below). Sequencing them after the entry hold rather than
     * alongside it is what keeps every scripted delay meaning what it says: an
     * `auto` at one GAP_MS is two seconds after the audience can SEE the beat,
     * not two seconds after a keypress they cannot.
     */
    const startBeatChains = () => {
      // GAP_MS lead-in: the beat's picture has just landed, and its first
      // scripted line is the next visible motion after it.
      const exchange = step.exchange;
      if (exchange) runChain(session, () => runExchange(session, exchange, GAP_MS));

      // The scripted assignment: the beat makes the pick itself so the ad plays
      // without anyone touching the mouse, and Derek's reaction follows it. The
      // claim check is what makes it lose gracefully to a manual click — the
      // actor's Assign already took the beat's one assignment, and its reaction
      // is already running, so this chain just retires.
      const autoAssign = step.autoAssign;
      if (autoAssign) {
        runChain(session, async () => {
          await sleep(session, autoAssign.delayMs);
          if (session.cancelled || assignClaimed.current) return;
          assignClaimed.current = true;
          setScene((s) => (s.assignedTo ? s : { ...s, assignedTo: autoAssign.person }));
          const reaction = step.onAssign;
          if (reaction && reaction.person === autoAssign.person) {
            await playAssignReaction(session, reaction);
          }
        });
      }

      for (const auto of step.autos ?? []) {
        runChain(session, async () => {
          await sleep(session, auto.delayMs);
          if (session.cancelled) return;
          if (auto.apply) setScene(auto.apply);
          // An auto's own banner is not tied to a scripted message, so it keeps
          // firing on this timer.
          if (auto.banner) pushBanner(auto.banner);
          if (auto.exchange) await runExchange(session, auto.exchange);
        });
      }
    };

    /**
     * THE ENTRY CHAIN. Hold on the previous beat's frame, then land this one.
     *
     * Everything the audience sees change at a beat boundary happens on the far
     * side of this sleep: the scene patch (clock, windows, front app, channel,
     * Pulse numbers, overlay) and the step-level banner. It is an ordinary
     * `sleep(session, …)`, so it inherits the whole control surface for free —
     * ArrowRight mid-hold sets `fast`, the sleep resolves without a timer, the
     * patch and every remaining chain flush, and the advance follows off the
     * same press; ArrowLeft or R cancel it before it can touch the scene.
     *
     * The beat's own chains start INSIDE this one, after the patch. They are
     * registered on the same session, and `settleSession` re-drains, so a
     * fast-forward still awaits chains that this one only started as it
     * unwound.
     */
    runChain(session, async () => {
      await sleep(session, entryHoldMs(step));
      if (session.cancelled) return;
      // THE SCRIPTED CHIP PRESS. Between the entry hold and the patch, so the
      // beat reads as caused: the previous frame holds, the "Open Pulse" chip
      // under Priya's line visibly depresses, and it releases in the SAME
      // update that opens the window (both setStates are in one synchronous
      // block, so React batches them into one frame). Skipped when Pulse is
      // already on the desk, which is exactly the case where the actor pressed
      // the chip themselves — the ad never presses a button twice.
      if (step.id === PULSE_CHIP_PRESS_STEP_ID && !pulseOpenRef.current) {
        setPulseChipPressed(true);
        await sleep(session, PULSE_CHIP_PRESS_MS);
        setPulseChipPressed(false);
        if (session.cancelled) return;
      }
      const base = entryBaseRef.current;
      entryBaseRef.current = null;
      setScene(base ? step.apply(base) : step.apply);
      // Step-level banners are the ones NOT tied to a scripted message. They
      // fire with the beat's landing, which is what beat entry now means.
      if (step.banner) pushBanner(step.banner);
      startBeatChains();
    });

    // Covers the step change (forward OR back), the reset (runKey) and unmount,
    // and also kills any assign-reaction chain started against this same session
    // during the step.
    return () => cancelSession();
  }, [stepIndex, runKey, pushBanner, runChain, runExchange, cancelSession, playAssignReaction]);

  /* -------------------------------------------------------- composer caret */

  // Keep the native caret pinned to the end of the scripted text so it blinks
  // where a person's would. Only while the field actually has focus, so a human
  // clicking into the composer between beats keeps their own cursor.
  useEffect(() => {
    const el = composerRef.current;
    if (!el || document.activeElement !== el) return;
    const end = scene.composer.length;
    el.setSelectionRange(end, end);
  }, [scene.composer]);

  /* ------------------------------------------------------- office assigning */

  /**
   * The actor assigning by hand, on camera. Claiming the beat's one assignment
   * here is what cancels a pending `autoAssign`: the auto's chain wakes later,
   * sees the claim and retires without touching anything, so the same beat can
   * never be assigned twice or fire its reaction twice.
   */
  function handleAssign(name: string) {
    if (assignClaimed.current || scene.assignedTo) return;
    assignClaimed.current = true;
    setScene((prev) => (prev.assignedTo ? prev : { ...prev, assignedTo: name }));

    const reaction = SCRIPT[stepRef.current].onAssign;
    if (!reaction || reaction.person !== name) return;
    const session = sessionRef.current;
    if (!session || session.cancelled) return;
    // The beat's own chains may already have finished, so the reaction is what
    // makes the timeline active again.
    setActiveOverride({ beat: session.beat, run: session.run, active: true });
    runChain(session, () => playAssignReaction(session, reaction));
  }

  /* ------------------------------------------------------------ dock/chrome */

  /** Every open window carries the dock's open dot, exactly like the real
   * dock. */
  const openApps = useMemo(() => new Set<AppId>(scene.windows), [scene.windows]);

  /** Dock click: opens the app if it isn't on the desk yet (it lands on the
   * next cascade step), otherwise just raises it. Same semantics as the real
   * Taskbar -> openWindow -> bringToFront path. */
  function handleSelectApp(id: AppId) {
    if (!SCRIPTED_APPS.has(id)) return;
    const app = id as FrontApp;
    setScene((prev) =>
      prev.windows.includes(app)
        ? { ...prev, frontApp: app }
        : { ...prev, windows: [...prev.windows, app], frontApp: app },
    );
  }

  /** Clicking anywhere in a window raises it. The z-bump is applied straight
   * away (so the click feels live) and the scene's front app follows; the sync
   * effect's own bringToFront is then a no-op, as in the store. */
  function handleFocusApp(app: FrontApp) {
    setLayout((prev) => focusWindow(prev, app));
    setScene((prev) => (prev.frontApp === app ? prev : { ...prev, frontApp: app }));
  }

  function handleMoveApp(app: FrontApp, x: number, y: number) {
    setLayout((prev) => moveWindow(prev, app, x, y));
  }

  function handleResizeApp(app: FrontApp, width: number, height: number, clamp: WindowSizeClamp) {
    setLayout((prev) => resizeWindow(prev, app, width, height, clamp));
  }

  /** Sidebar clicks are live so the actor can browse between beats. Same
   * semantics as the script's own `read` patch: opening a channel clears its
   * unread treatment. */
  function handleSelectChannel(id: ChannelId) {
    setScene((prev) => ({
      ...prev,
      activeChannel: id,
      unread: prev.unread.filter((c) => c !== id),
    }));
  }

  /** Clicking a message's document chip, the actor path into the eval doc. The
   * real chip opens the doc in its own window; here that is the same
   * open-or-raise the dock does, so a click mid-beat lands exactly where the
   * next beat would have staged it anyway. */
  function handleOpenDoc() {
    handleSelectApp("docs");
  }

  /** The "Open Pulse" chip. Deliberately the SAME call the dock tile makes, so
   * a chip press and a dock click put the window in the same place and leave
   * the same scene state behind — which is what lets a manual press compose
   * with the fold (ArrowLeft and R rebuild from the script and simply discard
   * it, exactly as they discard any other manual window opening). */
  function handleOpenPulse() {
    handleSelectApp("pulse");
  }

  function handleComposerChange(next: string) {
    setScene((prev) => ({ ...prev, composer: next }));
  }

  /* ------------------------------------------------------------------ view */

  const step = SCRIPT[stepIndex];
  const progress = dayProgress(scene);
  const ambientTint = getAmbientTint(progress);

  // Every beat with an entry hold is running a timeline from the moment it is
  // entered — the hold itself is one — as is any beat that declares an
  // exchange, autos or a scripted assignment. So that is the default, and the
  // operator's "typing…" cue is lit through the hold too, which is exactly when
  // they most need to know a skip is available. The override only speaks for
  // the beat it was written in (see activeOverride).
  const beatHasTimeline = Boolean(
    entryHoldMs(step) > 0 || step.exchange?.length || step.autos?.length || step.autoAssign,
  );
  const timelineActive =
    activeOverride && activeOverride.beat === stepIndex && activeOverride.run === runKey
      ? activeOverride.active
      : beatHasTimeline;

  // The real app only shows the typing indicator when the pending reply belongs
  // to the channel currently on screen (see MessageList). Same rule here, so
  // switching channels mid-hold reveals or hides it exactly as it would live.
  const typingAgentId =
    scene.typing && scene.typing.channel === scene.activeChannel ? scene.typing.agentId : null;

  function renderApp(app: FrontApp) {
    switch (app) {
      case "pulse":
        return <ScriptedPulse pulse={scene.pulse} />;
      case "office":
        return <ScriptedOffice assignedTo={scene.assignedTo} onAssign={handleAssign} />;
      case "taskflow":
        return <ScriptedTaskflow />;
      case "docs":
        return <ScriptedDocs />;
      default:
        return (
          <ScriptedChattr
            activeChannel={scene.activeChannel}
            unread={scene.unread}
            messages={scene.messages[scene.activeChannel]}
            typingAgentId={typingAgentId}
            composer={scene.composer}
            onComposerChange={handleComposerChange}
            onComposerSend={handleScriptedSend}
            composerRef={composerRef}
            onSelectChannel={handleSelectChannel}
            onOpenDoc={handleOpenDoc}
            onOpenPulse={handleOpenPulse}
            pulseChipPressed={pulseChipPressed}
          />
        );
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      {/* The REAL status bar. Every control is present and correctly styled
          (difficulty pill, +15m, battery meter, clock) but wired to no-ops:
          nothing on this route may advance a clock or flip real state.
          dayComplete stays false, so the "Day 2 ready" pill never appears. */}
      <StatusBarView
        clockLabel={clockLabel(scene)}
        batteryLevel={getBatteryLevel(progress)}
        difficulty="standard"
        dayComplete={false}
        onToggleDifficulty={() => {}}
        onSkipAhead={() => {}}
      />

      <div ref={deskRef} className="relative min-h-0 flex-1 overflow-hidden p-4">
        <Wallpaper dayProgress={progress} />
        <div
          className="pointer-events-none absolute inset-0 z-0 transition-colors duration-[3000ms] ease-linear"
          style={{ backgroundColor: ambientTint.color, opacity: ambientTint.opacity }}
        />
        {/* One REAL DesktopWindow per open app, at the frame the product's own
            cascade placed it in. Rendered in the beat's open order; the stack
            order is the zIndex on each frame, exactly like the live desk. */}
        {scene.windows.map((app) => {
          const frame = layout.frames[app];
          // First paint before the desk has been measured: nothing placed yet.
          if (!frame) return null;
          return (
            <DesktopWindowView
              key={app}
              frame={frame}
              title={WINDOW_TITLE[app]}
              icon={<AppIcon id={app} sizeClassName="h-4 w-4" />}
              containerRef={deskRef}
              minSize={APP_MIN_SIZE[app]}
              onFocus={() => handleFocusApp(app)}
              onMove={(x, y) => handleMoveApp(app, x, y)}
              onResize={(width, height, clamp) => handleResizeApp(app, width, height, clamp)}
              // Chrome fidelity only: the X is present because every real window
              // has one, but nothing closes during a take.
              onClose={() => {}}
            >
              {renderApp(app)}
            </DesktopWindowView>
          );
        })}
      </div>

      {/* The REAL dock, full shipping app list and order, with an open dot on
          every window currently on the desk. The four apps with scripted bodies
          open (or raise) their window on click, cascading onto the desk exactly
          like the live app. Office also opens on its own at the WRONG PICK beat,
          and the actor can still raise or open any of the four by hand; the rest
          no-op.
          The badge count is scripted, never derived from the messages. */}
      <TaskbarView
        openApps={openApps}
        onSelectApp={handleSelectApp}
        chattrBadgeCount={scene.chattrBadge}
      />

      {/* Full-screen beats. They sit above the desktop but below the banner
          stack, so a stray banner would still read on camera. */}
      {scene.overlay === "scorecard" && <ScorecardReveal key={`scorecard-${runKey}`} />}
      {scene.overlay === "day2" && <Day2Transition key={`day2-${runKey}`} />}
      {scene.overlay === "eval" && (
        <div key={`eval-${runKey}`} className="fixed inset-0 z-40 overflow-y-auto bg-canvas">
          <EvalScreen traces={AD_TRACES} total={EVAL_BATCH_TOTAL} />
        </div>
      )}

      <Banners items={banners} />

      {/* Operator HUD. Deliberately tiny and dim; crop it out or ignore it.
          The mode word is the honest state of the movie: `auto` while a beat is
          playing itself, `auto · gap` during the two-second seam before the
          next beat lands, and `end` on the final beat, which holds forever.
          ArrowRight is a SKIP now, not a "next" — playback advances on its
          own. */}
      <div className="pointer-events-none fixed bottom-1 right-2 z-50 font-mono text-caption tabular-nums text-text-secondary opacity-40">
        {`${stepIndex}/${SCRIPT.length - 1} ${step.label} · ${
          stepIndex >= SCRIPT.length - 1 ? "end" : timelineActive ? "auto" : "auto · gap"
        } · right arrow skip · left arrow back · r reset`}
      </div>
    </div>
  );
}
