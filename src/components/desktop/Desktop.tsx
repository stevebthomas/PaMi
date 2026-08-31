"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Taskbar } from "./Taskbar";
import { StatusBar } from "./StatusBar";
import { Wallpaper } from "./Wallpaper";
import { DesktopWindow } from "./DesktopWindow";
import { ChattrApp } from "../chattr/ChattrApp";
import { DmHeaderBadge } from "../chattr/DmHeaderBadge";
import { PulseMock } from "../pulse/PulseMock";
import { DayScorecard } from "../scorecard/DayScorecard";
import { OnboardingScreen } from "../onboarding/OnboardingScreen";
import { AskClaudeApp } from "../askclaude/AskClaudeApp";
import { ReviewsApp } from "../reviews/ReviewsApp";
import { NotesApp } from "../notes/NotesApp";
import { TaskflowApp } from "../taskflow/TaskflowApp";
import { OfficeApp } from "../office/OfficeApp";
import { DocsApp } from "../docs/DocsApp";
import { useSimStore } from "@/store/simStore";
import { useWindowStore } from "@/store/windowStore";
import { useDocsStore } from "@/store/docsStore";
import { getSessionCostSummary } from "@/store/costStore";
import { getAmbientTint, getDayProgress } from "@/lib/sim/timeOfDay";
import { restoreSession, startSessionPersistence, resetSession } from "@/lib/sim/sessionPersistence";

export type AppId = "chattr" | "pulse" | "taskflow" | "askClaude" | "reviews" | "notes" | "office" | "docs";

export const APP_DEFAULT_SIZE: Record<AppId, { width: number; height: number }> = {
  chattr: { width: 760, height: 600 },
  pulse: { width: 700, height: 560 },
  taskflow: { width: 700, height: 560 },
  askClaude: { width: 640, height: 580 },
  reviews: { width: 640, height: 580 },
  notes: { width: 480, height: 520 },
  office: { width: 860, height: 660 },
  docs: { width: 640, height: 600 },
};

/** Smallest each window may be resized to (see DesktopWindow's resize handle).
 * Derived from each app's internal reflow: Chattr needs both fixed rails plus a
 * usable thread; Pulse/Taskflow need their card grids to survive a 2-up
 * collapse; Office/Docs go single-column at their floor; the simpler apps share
 * a generic 360x360 minimum. */
export const APP_MIN_SIZE: Record<AppId, { width: number; height: number }> = {
  chattr: { width: 540, height: 420 },
  pulse: { width: 460, height: 400 },
  taskflow: { width: 480, height: 400 },
  askClaude: { width: 360, height: 360 },
  reviews: { width: 360, height: 360 },
  notes: { width: 360, height: 360 },
  office: { width: 400, height: 400 },
  docs: { width: 380, height: 360 },
};

export function Desktop() {
  // "loading" until the mount effect has run the client-only restore. The
  // resume decision depends on restoreSession(), which reads localStorage:
  // unavailable during server prerender. Deciding it in a useState initializer
  // would run on the server (returns false -> onboarding HTML) AND on the
  // resuming client (returns true -> desktop), a structural hydration
  // mismatch. So server and first client render both produce the SAME neutral
  // frame ("loading"), and the resume decision is made client-side in the
  // effect below. A brief neutral first frame is the accepted cost; a resuming
  // player never sees the onboarding screen flash (loading -> desktop directly).
  const [phase, setPhase] = useState<"loading" | "onboarding" | "desktop">("loading");
  const startDay = useSimStore((s) => s.startDay);
  const dayComplete = useSimStore((s) => s.dayComplete);
  // Persisted (not component-local) so reloading a completed day doesn't
  // re-render the full-screen DayScorecard overlay and eat StatusBar clicks
  // (QA finding #12b); see scorecardDismissed in simStore.ts.
  const scorecardDismissed = useSimStore((s) => s.scorecardDismissed);
  const dismissScorecard = useSimStore((s) => s.dismissScorecard);
  const day = useSimStore((s) => s.day);
  const clockMinutes = useSimStore((s) => s.clockMinutes);
  const windows = useWindowStore((s) => s.windows);
  const openWindow = useWindowStore((s) => s.openWindow);
  // Docs launch signal: the docsStore plays the dock-bounce, then flips
  // pendingOpen so Desktop (the only caller of openWindow with real desk
  // bounds) opens the window centered/cascaded like every other app.
  const docsPendingOpen = useDocsStore((s) => s.pendingOpen);
  const clearDocsPendingOpen = useDocsStore((s) => s.clearPendingOpen);
  const containerRef = useRef<HTMLDivElement>(null);

  const openApps = useMemo(() => new Set(Object.keys(windows) as AppId[]), [windows]);

  // Client-only restore + persistence startup, on mount. restoreSession()
  // hydrates both stores SYNCHRONOUSLY here, before the desktop can render
  // (so before any user-triggered advanceClock is reachable) and before the
  // desktop-entry effect below can call startDay (effects run in definition
  // order, and the entry effect no-ops while phase is still "loading" this
  // pass). A resumed started session goes straight to "desktop"; otherwise
  // "onboarding". startSessionPersistence runs after restore so the fresh
  // snapshot isn't clobbered, and is idempotent under StrictMode.
  useEffect(() => {
    const resumed = restoreSession();
    startSessionPersistence();
    // Deliberate setState-in-effect: this is the sanctioned mount-flag pattern
    // for a client-only decision that must not run during SSR. Deriving phase
    // from store state instead would risk an intermediate render showing the
    // onboarding screen before restore completes (an onboarding flash the spec
    // forbids); setting phase here in the same synchronous block as the restore
    // keeps the transition loading -> desktop atomic for a resuming player.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase(resumed ? "desktop" : "onboarding");
  }, []);

  // Dev-only console hooks so the API call/cost tracker is inspectable and the
  // saved session can be wiped without a debug panel: call
  // getSessionCostSummary() in devtools. resetSimSession() clears the saved
  // session and reloads a fresh one; it exists because refreshing no longer
  // wipes state (dev iteration used to rely on that), so this is the explicit
  // "start over" affordance.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { getSessionCostSummary: typeof getSessionCostSummary }).getSessionCostSummary = getSessionCostSummary;
      (window as unknown as { resetSimSession: () => void }).resetSimSession = resetSession;
    }
  }, []);

  // Entry into the desktop: fires both for a fresh onboarding->start and for
  // a resume. startDay()'s own `if (started) return` guard makes it a no-op on
  // resume (the initial scripted beat never re-fires); it only does real work
  // on a genuinely fresh session. Guaranteed to run AFTER restore: on the
  // mount pass phase is still "loading" so this returns early, then the restore
  // effect sets phase to "desktop" and this re-runs.
  useEffect(() => {
    if (phase !== "desktop") return;
    startDay();
    // Open Chattr by default so the player isn't dropped on an empty desktop.
    const bounds = containerRef.current;
    openWindow("chattr", APP_DEFAULT_SIZE.chattr, bounds?.clientWidth ?? 1024, bounds?.clientHeight ?? 640);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Opens the Docs window once the docsStore's launch animation completes and
  // flips pendingOpen. Kept here (not in the store) so openWindow is still only
  // ever called with real containerRef desk dimensions: the window then
  // centers/cascades exactly like every other app. Clearing the flag after is
  // idempotent under StrictMode (openWindow bringsToFront if already open).
  useEffect(() => {
    if (!docsPendingOpen) return;
    const bounds = containerRef.current;
    openWindow("docs", APP_DEFAULT_SIZE.docs, bounds?.clientWidth ?? 1024, bounds?.clientHeight ?? 640);
    clearDocsPendingOpen();
  }, [docsPendingOpen, openWindow, clearDocsPendingOpen]);

  // Neutral frame shown on the server and the first client render (identical on
  // both, so no hydration mismatch) until the mount effect decides resume vs.
  // onboarding. Uses the same background as the real screens so it reads as a
  // brief load, not a white flash.
  if (phase === "loading") {
    return <div className="h-dvh w-full bg-canvas" />;
  }

  if (phase === "onboarding") {
    return (
      <OnboardingScreen
        onStart={(name) => {
          useSimStore.getState().setPlayerName(name);
          setPhase("desktop");
        }}
      />
    );
  }

  function handleSelectApp(id: AppId) {
    const bounds = containerRef.current;
    openWindow(id, APP_DEFAULT_SIZE[id], bounds?.clientWidth ?? 1024, bounds?.clientHeight ?? 640);
  }

  const dayProgress = getDayProgress(clockMinutes, day);
  const ambientTint = getAmbientTint(dayProgress);

  return (
    <div className="flex h-dvh w-full flex-col bg-canvas">
      <StatusBar />
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden p-4">
        <Wallpaper dayProgress={dayProgress} />
        <div
          className="pointer-events-none absolute inset-0 z-0 transition-colors duration-[3000ms] ease-linear"
          style={{ backgroundColor: ambientTint.color, opacity: ambientTint.opacity }}
        />
        {windows.chattr && (
          <DesktopWindow
            id="chattr"
            title="CHATTR"
            headerRight={<DmHeaderBadge />}
            containerRef={containerRef}
            minSize={APP_MIN_SIZE.chattr}
          >
            <ChattrApp />
          </DesktopWindow>
        )}
        {windows.pulse && (
          <DesktopWindow id="pulse" title="PULSE" containerRef={containerRef} minSize={APP_MIN_SIZE.pulse}>
            <PulseMock />
          </DesktopWindow>
        )}
        {windows.askClaude && (
          <DesktopWindow
            id="askClaude"
            title="ASK CLAUDE"
            containerRef={containerRef}
            minSize={APP_MIN_SIZE.askClaude}
          >
            <AskClaudeApp />
          </DesktopWindow>
        )}
        {windows.reviews && (
          <DesktopWindow
            id="reviews"
            title="REVIEWS"
            containerRef={containerRef}
            minSize={APP_MIN_SIZE.reviews}
          >
            <ReviewsApp />
          </DesktopWindow>
        )}
        {windows.notes && (
          <DesktopWindow id="notes" title="NOTES" containerRef={containerRef} minSize={APP_MIN_SIZE.notes}>
            <NotesApp />
          </DesktopWindow>
        )}
        {windows.taskflow && (
          <DesktopWindow id="taskflow" title="TASKFLOW" containerRef={containerRef} minSize={APP_MIN_SIZE.taskflow}>
            <TaskflowApp />
          </DesktopWindow>
        )}
        {windows.office && (
          <DesktopWindow id="office" title="OFFICE" containerRef={containerRef} minSize={APP_MIN_SIZE.office}>
            <OfficeApp />
          </DesktopWindow>
        )}
        {windows.docs && (
          <DesktopWindow id="docs" title="DOCS" containerRef={containerRef} minSize={APP_MIN_SIZE.docs}>
            <DocsApp />
          </DesktopWindow>
        )}
      </div>

      <Taskbar openApps={openApps} onSelectApp={handleSelectApp} />

      {dayComplete && !scorecardDismissed && <DayScorecard onClose={dismissScorecard} />}
    </div>
  );
}
