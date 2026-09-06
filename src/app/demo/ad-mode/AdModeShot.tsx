"use client";
/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL AD/GAME CONTENT — safe to delete after ad shoot is done.
 *
 * The ad-mode engine and desktop layout.
 *
 * Hotkeys (global, route level):
 *   ArrowLeft  advance one scripted beat (clamps at the last one)
 *   r / R      reset to beat 0, clearing every pending timer and banner
 *
 * Both are ignored while a modifier is held or while focus is in a text field,
 * so typing in the eval screen's Reason / Good response inputs cannot advance
 * or reset the take.
 *
 * Nothing on this route is real: the clock, the messages, the Pulse numbers,
 * the unread badge and the scorecard are all read straight out of script.ts.
 * Hardcoded for filming, no real logic.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Building2, MessageSquare, SquareKanban } from "lucide-react";
import { Window } from "@/components/desktop/Window";
import { EvalScreen, type Trace } from "../shared/EvalScreen";
import { Banners, type BannerItem } from "./Banners";
import { FakeChattr, FakeOffice, FakePulse, FakeTaskflow } from "./FakeWindows";
import { Day2Transition, ScorecardReveal } from "./ScorecardReveal";
import { INITIAL_SCENE, SCRIPT, type BannerSpec, type FrontApp, type SceneState } from "./script";

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

const DOCK: { id: FrontApp; label: string; Icon: typeof MessageSquare }[] = [
  { id: "chattr", label: "Chattr", Icon: MessageSquare },
  { id: "pulse", label: "Pulse", Icon: Activity },
  { id: "taskflow", label: "Taskflow", Icon: SquareKanban },
  { id: "office", label: "Office", Icon: Building2 },
];

const WINDOW_TITLE: Record<FrontApp, string> = {
  chattr: "Chattr",
  pulse: "Pulse",
  taskflow: "Taskflow",
  office: "Office",
};

export default function AdModeShot() {
  const [scene, setScene] = useState<SceneState>(INITIAL_SCENE);
  const [stepIndex, setStepIndex] = useState(0);
  const [banners, setBanners] = useState<BannerItem[]>([]);
  /** Bumped on reset so keyed overlays remount and replay their animations. */
  const [runKey, setRunKey] = useState(0);

  // stepIndex mirrored into a ref so the keydown handler and the Office assign
  // handler can read the current beat without re-binding on every step.
  const stepRef = useRef(0);
  /** Timers belonging to the CURRENT step (autos + assign reactions). Cleared
   * on every step change and on reset. */
  const stepTimers = useRef<number[]>([]);
  /** Banner dismiss timers. Cleared on reset only: clearing them on a step
   * change would strand a banner on screen forever. */
  const bannerTimers = useRef<number[]>([]);
  /** One scripted assign reaction per step, at most. */
  const assignFired = useRef(false);
  const bannerId = useRef(0);

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

  const advance = useCallback(() => {
    const next = stepRef.current + 1;
    if (next >= SCRIPT.length) return;
    stepRef.current = next;
    setStepIndex(next);
    const step = SCRIPT[next];
    setScene(step.apply);
    if (step.banner) pushBanner(step.banner);
  }, [pushBanner]);

  const reset = useCallback(() => {
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
    bannerTimers.current.forEach(clearTimeout);
    bannerTimers.current = [];
    assignFired.current = false;
    stepRef.current = 0;
    setStepIndex(0);
    setScene(INITIAL_SCENE);
    setBanners([]);
    setRunKey((k) => k + 1);
  }, []);

  /* ------------------------------------------------------------- hotkeys */

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // The eval overlay is the only surface here with text fields; never let
      // typing in one drive the take.
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

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        advance();
        return;
      }
      if (event.key === "r" || event.key === "R") {
        reset();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advance, reset]);

  /* ---------------------------------------------------- scripted sub-events */

  useEffect(() => {
    assignFired.current = false;
    const step = SCRIPT[stepIndex];
    const ids: number[] = [];
    for (const auto of step.autos ?? []) {
      ids.push(
        window.setTimeout(() => {
          if (auto.apply) setScene(auto.apply);
          if (auto.banner) pushBanner(auto.banner);
        }, auto.delayMs),
      );
    }
    stepTimers.current = ids;
    return () => {
      // Covers both the step change and reset (runKey), and also flushes any
      // assign-reaction timer pushed onto the same ref during the step.
      stepTimers.current.forEach(clearTimeout);
      stepTimers.current = [];
    };
  }, [stepIndex, runKey, pushBanner]);

  /* ------------------------------------------------------- office assigning */

  function handleAssign(name: string) {
    if (scene.assignedTo) return;
    setScene((prev) => (prev.assignedTo ? prev : { ...prev, assignedTo: name }));

    const reaction = SCRIPT[stepRef.current].onAssign;
    if (!reaction || reaction.person !== name || assignFired.current) return;
    assignFired.current = true;
    stepTimers.current.push(
      window.setTimeout(() => {
        if (reaction.apply) setScene(reaction.apply);
        if (reaction.banner) pushBanner(reaction.banner);
      }, reaction.delayMs),
    );
  }

  /* ------------------------------------------------------------------ view */

  const step = SCRIPT[stepIndex];
  const { Icon } = DOCK.find((d) => d.id === scene.frontApp) ?? DOCK[0];

  function renderFront() {
    switch (scene.frontApp) {
      case "pulse":
        return <FakePulse pulse={scene.pulse} />;
      case "office":
        return <FakeOffice assignedTo={scene.assignedTo} onAssign={handleAssign} />;
      case "taskflow":
        return <FakeTaskflow />;
      default:
        return (
          <FakeChattr
            activeChannel={scene.activeChannel}
            unread={scene.unread}
            messages={scene.messages[scene.activeChannel]}
          />
        );
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      {/* Status bar lookalike: BAZAARLOOP on the left, scripted clock on the
          right. No difficulty toggle, no +15m, no battery. */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border-hairline bg-surface px-3">
        <div className="text-label font-semibold tracking-wide text-text-secondary">BAZAARLOOP</div>
        <div className="font-mono text-label tabular-nums text-text-primary">{scene.clock}</div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="h-[520px] w-full max-w-4xl">
          <Window
            title={WINDOW_TITLE[scene.frontApp]}
            icon={<Icon className="h-4 w-4" strokeWidth={2} aria-hidden />}
            // Chrome fidelity only: the X is present because every real window
            // has one, but nothing closes during a take.
            onClose={() => {}}
          >
            {renderFront()}
          </Window>
        </div>
      </div>

      {/* Taskbar lookalike. The icons really do switch the front window: the
          actor clicks Office on camera. */}
      <div className="flex h-14 shrink-0 items-center justify-center border-t border-border-hairline bg-surface px-3">
        <div className="flex items-end gap-1.5">
          {DOCK.map((app) => {
            const isFront = scene.frontApp === app.id;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => setScene((prev) => ({ ...prev, frontApp: app.id }))}
                className="group relative flex cursor-pointer flex-col items-center gap-1"
                title={app.label}
              >
                <div
                  className={`relative flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                    isFront
                      ? "border border-border-hairline bg-surface text-text-primary"
                      : "text-text-secondary group-hover:bg-muted"
                  }`}
                >
                  <app.Icon className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                  {/* Scripted unread count, never derived from the messages. */}
                  {app.id === "chattr" && scene.chattrBadge > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-green px-1 text-caption leading-none tabular-nums text-white">
                      {scene.chattrBadge}
                    </span>
                  )}
                </div>
                <div
                  className={`h-1 w-1 rounded-full ${isFront ? "bg-accent-green" : "bg-transparent"}`}
                />
                <span className="pointer-events-none absolute -top-7 hidden whitespace-nowrap rounded-md border border-border-hairline bg-surface px-1.5 py-0.5 text-caption text-text-primary shadow-md group-hover:block">
                  {app.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

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

      {/* Operator HUD. Deliberately tiny and dim; crop it out or ignore it. */}
      <div className="pointer-events-none fixed bottom-1 right-2 z-50 font-mono text-caption tabular-nums text-text-secondary opacity-40">
        {stepIndex}/{SCRIPT.length - 1} {step.label} · left arrow next · r reset
      </div>
    </div>
  );
}
