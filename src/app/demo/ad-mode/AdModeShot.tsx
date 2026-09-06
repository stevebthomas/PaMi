"use client";
/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL AD/GAME CONTENT — safe to delete after ad shoot is done.
 *
 * The ad-mode engine and desktop layout.
 *
 * Hotkeys (global, route level):
 *   ArrowLeft  idle:   advance one scripted beat (clamps at the last one)
 *              typing: FAST-FORWARD the running timeline — the player's line is
 *                      typed out and sent instantly, every indicator is skipped,
 *                      every message and banner of the beat lands at once. The
 *                      beat does NOT advance; the next press does.
 *   r / R      cancel every timer and animation, reset to beat 0
 *
 * ONE capture-phase listener implements both, deliberately:
 *   - CAPTURE, because during a player line the real composer has focus (so the
 *     native caret blinks at the end of the text) and a bubble listener would be
 *     opted out by the text-field guard.
 *   - ONE listener, because a press must resolve to exactly one action. It reads
 *     the "is a timeline running" flag once, up front, before anything mutates,
 *     and branches on that snapshot. Splitting this across a capture and a
 *     bubble listener does NOT work: the browser drains microtasks between
 *     listener invocations, so the fast-forward done in capture let the
 *     timeline's chains settle and go idle before the bubble handler read the
 *     flag, which then advanced the beat off the very same keypress.
 *   - the text-field guard still applies whenever no timeline is running, so
 *     typing in the eval screen's Reason / Good response inputs, or in the
 *     composer between beats, can never advance or reset a take.
 *
 * The CHROME here is the real app's: the real StatusBar (difficulty pill, +15m,
 * battery meter, clock), the real Wallpaper and ambient time-of-day tint, the
 * real Window shell with its real AppIcon, and the real Taskbar dock with every
 * app in the shipping order. All of it is rendered through those components'
 * presentational cores and fed from script.ts, so nothing on this route reads
 * or writes a real store, and the system controls are deliberately inert.
 *
 * Nothing on this route is real: the clock, the messages, the Pulse numbers,
 * the unread badge and the scorecard are all read straight out of script.ts.
 * Hardcoded for filming, no real logic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Window } from "@/components/desktop/Window";
import { Wallpaper } from "@/components/desktop/Wallpaper";
import { StatusBarView } from "@/components/desktop/StatusBar";
import { TaskbarView } from "@/components/desktop/Taskbar";
import { AppIcon } from "@/components/shared/AppIcon";
import type { AppId } from "@/components/desktop/Desktop";
import { getAmbientTint, getBatteryLevel } from "@/lib/sim/timeOfDay";
import { EvalScreen, type Trace } from "../shared/EvalScreen";
import { Banners, type BannerItem } from "./Banners";
import { ScriptedChattr, ScriptedOffice, ScriptedPulse, ScriptedTaskflow } from "./ScriptedApps";
import { Day2Transition, ScorecardReveal } from "./ScorecardReveal";
import {
  INITIAL_SCENE,
  PLAYER_TYPING,
  SCRIPT,
  clockLabel,
  dayProgress,
  landLine,
  npcIndicatorMs,
  playerCharDelayMs,
  type BannerSpec,
  type ChannelId,
  type ExchangeEvent,
  type FrontApp,
  type NpcLine,
  type PlayerLine,
  type PlayerTypingConfig,
  type SceneState,
} from "./script";

/** The single eval trace the ad lands on. The counter still reads "trace 3 of
 * 20" because that string lives in the shared component. Hardcoded for
 * filming, no real eval behind it. */
const AD_TRACES: Trace[] = [
  {
    no: 3,
    meta: "listing-assistant · draft · 9:04 AM",
    sample:
      "Vintage-Inspired Countertop Companion. Barely Used, Full of Character! This retro chrome toaster still toasts like it means it, and honestly, this toaster has seen things. A statement piece for any counter, priced to move.",
  },
];

const BANNER_HOLD_MS = 2600;
const BANNER_EXIT_MS = 300;

/** The dock tiles that actually switch the front window on click. Every other
 * real app is still on the dock (TaskbarView renders the full shipping list in
 * the shipping order) but has no scripted body, so its tile no-ops. */
const SCRIPTED_APPS = new Set<string>(["chattr", "pulse", "taskflow", "office"]);

/** Real Desktop titles each window bar with the app's name in caps. */
const WINDOW_TITLE: Record<FrontApp, string> = {
  chattr: "CHATTR",
  pulse: "PULSE",
  taskflow: "TASKFLOW",
  office: "OFFICE",
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
 *   remaining step of the beat runs back-to-back in the same tick: subsequent
 *   sleeps resolve instantly and the typing loop jumps straight to the full
 *   string.
 *
 * A session is created per beat and shared by every chain in it (the beat's
 * exchange, each `auto`, and any assign reaction fired during the beat), so one
 * ArrowLeft flushes all of them at once.
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
};

function createSession(beat: number, run: number): Session {
  return { beat, run, cancelled: false, fast: false, wakes: new Set(), timers: new Set(), running: 0 };
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

export default function AdModeShot() {
  const [scene, setScene] = useState<SceneState>(INITIAL_SCENE);
  const [stepIndex, setStepIndex] = useState(0);
  const [banners, setBanners] = useState<BannerItem[]>([]);
  /** Bumped on reset so keyed overlays remount and replay their animations. */
  const [runKey, setRunKey] = useState(0);
  /**
   * Operator-HUD "typing…" state, and the thing ArrowLeft branches on. Derived
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
  /** One scripted assign reaction per step, at most. */
  const assignFired = useRef(false);
  const bannerId = useRef(0);
  /** The real composer's textarea, for focus/caret/synthetic-Enter. */
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  /** The player line the next scripted send should post. Read by the composer's
   * onSend, so the send path never has to inspect the textarea's value. */
  const pendingSendRef = useRef<PlayerLine | null>(null);

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

  /* ------------------------------------------------------- timeline chains */

  const runChain = useCallback((session: Session, body: () => Promise<void>) => {
    session.running += 1;
    timelineActiveRef.current = true;
    void body().finally(() => {
      session.running -= 1;
      // Only the CURRENT session may clear the HUD flag: a cancelled session's
      // chains unwinding must not stomp a freshly-started beat.
      if (session.running <= 0 && sessionRef.current === session) {
        timelineActiveRef.current = false;
        setActiveOverride({ beat: session.beat, run: session.run, active: false });
      }
    });
  }, []);

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
      // what keeps ArrowLeft/R working while it holds focus.
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
      const hold = line.indicatorMs ?? npcIndicatorMs(line.text.length);
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

  const runExchange = useCallback(
    async (session: Session, events: ExchangeEvent[]) => {
      for (const event of events) {
        if (session.cancelled) return;
        if (event.kind === "player") await runPlayerLine(session, event);
        else await runNpcLine(session, event);
      }
    },
    [runPlayerLine, runNpcLine],
  );

  const cancelSession = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    timelineActiveRef.current = false;
    if (!session) return;
    session.cancelled = true;
    pendingSendRef.current = null;
    composerRef.current?.blur();
    releaseAll(session);
  }, []);

  /** ArrowLeft while a timeline is running: land everything now, stay on the
   * beat. */
  const fastForward = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.cancelled) return;
    session.fast = true;
    releaseAll(session);
  }, []);

  const advance = useCallback(() => {
    const next = stepRef.current + 1;
    if (next >= SCRIPT.length) return;
    stepRef.current = next;
    setStepIndex(next);
    const step = SCRIPT[next];
    setScene(step.apply);
    // Step-level banners are the ones NOT tied to a scripted message, so they
    // still fire at beat entry. Message-tied banners fire when their line lands.
    if (step.banner) pushBanner(step.banner);
  }, [pushBanner]);

  const reset = useCallback(() => {
    cancelSession();
    bannerTimers.current.forEach(clearTimeout);
    bannerTimers.current = [];
    assignFired.current = false;
    pendingSendRef.current = null;
    stepRef.current = 0;
    setStepIndex(0);
    setScene(INITIAL_SCENE);
    setBanners([]);
    setRunKey((k) => k + 1);
  }, [cancelSession]);

  /* ------------------------------------------------------------- hotkeys */

  useEffect(() => {
    /**
     * ONE listener, capture phase, for both hotkeys. It has to be capture
     * because during a player line the real composer holds focus, and it has to
     * be a SINGLE listener because a press must resolve to exactly one action.
     *
     * A capture listener plus a separate bubble listener could not do that: the
     * browser drains the microtask queue between two listener invocations, so
     * fast-forwarding in the capture handler let the timeline's chains settle
     * (releaseAll -> the sleeps resolve -> the last chain's `finally` flips
     * timelineActiveRef to false) before the bubble handler read the flag, and
     * that handler then saw an idle take and advanced the beat off the same
     * keypress. Reading `active` once, up front, before anything mutates, is
     * what makes "fast-forward now, advance on the NEXT press" exact.
     */
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const isAdvance = event.key === "ArrowLeft";
      const isReset = event.code === "KeyR" || event.key === "r" || event.key === "R";
      if (!isAdvance && !isReset) return;

      // Snapshot BEFORE any state mutation. Everything below branches on this
      // one value, so a press can never both skip and advance.
      const active = timelineActiveRef.current;

      // Idle: the original text-field guard applies, so typing in the eval
      // screen's Reason / Good response inputs (or in the composer between
      // beats) can never drive the take. While a timeline IS running, the
      // operator keeps both hotkeys even though the composer has focus — that
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

      event.preventDefault();
      event.stopPropagation();

      if (isAdvance) {
        if (active) fastForward();
        else advance();
        return;
      }
      reset();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [advance, reset, fastForward]);

  /* --------------------------------------------------- the beat's timeline */

  useEffect(() => {
    assignFired.current = false;
    const step = SCRIPT[stepIndex];
    const session = createSession(stepIndex, runKey);
    sessionRef.current = session;

    const exchange = step.exchange;
    if (exchange) runChain(session, () => runExchange(session, exchange));

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

    // Covers the step change, the reset (runKey) and unmount, and also kills any
    // assign-reaction chain started against this same session during the step.
    return () => cancelSession();
  }, [stepIndex, runKey, pushBanner, runChain, runExchange, cancelSession]);

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

  function handleAssign(name: string) {
    if (scene.assignedTo) return;
    setScene((prev) => (prev.assignedTo ? prev : { ...prev, assignedTo: name }));

    const reaction = SCRIPT[stepRef.current].onAssign;
    if (!reaction || reaction.person !== name || assignFired.current) return;
    const session = sessionRef.current;
    if (!session || session.cancelled) return;
    assignFired.current = true;
    // The beat's own chains may already have finished, so the reaction is what
    // makes the timeline active again.
    setActiveOverride({ beat: session.beat, run: session.run, active: true });
    runChain(session, async () => {
      await sleep(session, reaction.delayMs);
      if (session.cancelled) return;
      if (reaction.apply) setScene(reaction.apply);
      if (reaction.banner) pushBanner(reaction.banner);
      if (reaction.exchange) await runExchange(session, reaction.exchange);
    });
  }

  /* ------------------------------------------------------------ dock/chrome */

  /** One window is on screen at a time, so exactly one dock tile carries the
   * open dot — the same treatment the real dock gives an open app. */
  const openApps = useMemo(() => new Set<AppId>([scene.frontApp]), [scene.frontApp]);

  function handleSelectApp(id: AppId) {
    if (!SCRIPTED_APPS.has(id)) return;
    setScene((prev) => ({ ...prev, frontApp: id as FrontApp }));
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

  function handleComposerChange(next: string) {
    setScene((prev) => ({ ...prev, composer: next }));
  }

  /* ------------------------------------------------------------------ view */

  const step = SCRIPT[stepIndex];
  const progress = dayProgress(scene);
  const ambientTint = getAmbientTint(progress);

  // Entering a beat that declares an exchange or autos starts its timeline, so
  // that is the default; the override only speaks for the beat it was written
  // in (see activeOverride).
  const beatHasTimeline = Boolean(step.exchange?.length || step.autos?.length);
  const timelineActive =
    activeOverride && activeOverride.beat === stepIndex && activeOverride.run === runKey
      ? activeOverride.active
      : beatHasTimeline;

  // The real app only shows the typing indicator when the pending reply belongs
  // to the channel currently on screen (see MessageList). Same rule here, so
  // switching channels mid-hold reveals or hides it exactly as it would live.
  const typingAgentId =
    scene.typing && scene.typing.channel === scene.activeChannel ? scene.typing.agentId : null;

  function renderFront() {
    switch (scene.frontApp) {
      case "pulse":
        return <ScriptedPulse pulse={scene.pulse} />;
      case "office":
        return <ScriptedOffice assignedTo={scene.assignedTo} onAssign={handleAssign} />;
      case "taskflow":
        return <ScriptedTaskflow />;
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

      <div className="relative min-h-0 flex-1 overflow-hidden p-4">
        <Wallpaper dayProgress={progress} />
        <div
          className="pointer-events-none absolute inset-0 z-0 transition-colors duration-[3000ms] ease-linear"
          style={{ backgroundColor: ambientTint.color, opacity: ambientTint.opacity }}
        />
        <div className="relative z-10 flex h-full items-center justify-center">
          <div className="h-[520px] w-full max-w-4xl">
            <Window
              title={WINDOW_TITLE[scene.frontApp]}
              icon={<AppIcon id={scene.frontApp} sizeClassName="h-4 w-4" />}
              // Chrome fidelity only: the X is present because every real window
              // has one, but nothing closes during a take.
              onClose={() => {}}
            >
              {renderFront()}
            </Window>
          </div>
        </div>
      </div>

      {/* The REAL dock, full shipping app list and order. The four apps with
          scripted bodies switch the front window on click (the actor clicks
          Office on camera); the rest no-op. The badge count is scripted, never
          derived from the messages. */}
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
          <EvalScreen traces={AD_TRACES} />
        </div>
      )}

      <Banners items={banners} />

      {/* Operator HUD. Deliberately tiny and dim; crop it out or ignore it. The
          "typing…" state is the cue that a fast-forward press is available. */}
      <div className="pointer-events-none fixed bottom-1 right-2 z-50 font-mono text-caption tabular-nums text-text-secondary opacity-40">
        {`${stepIndex}/${SCRIPT.length - 1} ${step.label}${
          timelineActive ? " · typing…" : ""
        } · left arrow ${timelineActive ? "skip" : "next"} · r reset`}
      </div>
    </div>
  );
}
