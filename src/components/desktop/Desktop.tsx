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
import { useSimStore } from "@/store/simStore";
import { useWindowStore } from "@/store/windowStore";
import { getSessionCostSummary } from "@/store/costStore";
import { getAmbientTint, getDayProgress } from "@/lib/sim/timeOfDay";
import { restoreSession, startSessionPersistence, resetSession } from "@/lib/sim/sessionPersistence";

export type AppId = "chattr" | "pulse" | "taskflow" | "askClaude" | "reviews" | "notes" | "office";

const APP_DEFAULT_SIZE: Record<AppId, { width: number; height: number }> = {
  chattr: { width: 760, height: 600 },
  pulse: { width: 700, height: 560 },
  taskflow: { width: 700, height: 560 },
  askClaude: { width: 640, height: 580 },
  reviews: { width: 640, height: 580 },
  notes: { width: 480, height: 520 },
  office: { width: 860, height: 660 },
};

export function Desktop() {
  // "loading" until the mount effect has run the client-only restore. The
  // resume decision depends on restoreSession(), which reads localStorage —
  // unavailable during server prerender. Deciding it in a useState initializer
  // would run on the server (returns false -> onboarding HTML) AND on the
  // resuming client (returns true -> desktop), a structural hydration
  // mismatch. So server and first client render both produce the SAME neutral
  // frame ("loading"), and the resume decision is made client-side in the
  // effect below. A brief neutral first frame is the accepted cost; a resuming
  // player never sees the onboarding screen flash (loading -> desktop directly).
  const [phase, setPhase] = useState<"loading" | "onboarding" | "desktop">("loading");
  const [scorecardDismissed, setScorecardDismissed] = useState(false);
  const startDay = useSimStore((s) => s.startDay);
  const dayComplete = useSimStore((s) => s.dayComplete);
  const day = useSimStore((s) => s.day);
  const clockMinutes = useSimStore((s) => s.clockMinutes);
  const windows = useWindowStore((s) => s.windows);
  const openWindow = useWindowStore((s) => s.openWindow);
  const containerRef = useRef<HTMLDivElement>(null);

  const openApps = useMemo(() => new Set(Object.keys(windows) as AppId[]), [windows]);

  // Client-only restore + persistence startup, on mount. restoreSession()
  // hydrates both stores SYNCHRONOUSLY here — before the desktop can render
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
  // saved session can be wiped without a debug panel — call
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

  // Entry into the desktop — fires both for a fresh onboarding->start and for
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

  // Neutral frame shown on the server and the first client render (identical on
  // both, so no hydration mismatch) until the mount effect decides resume vs.
  // onboarding. Uses the same background as the real screens so it reads as a
  // brief load, not a white flash.
  if (phase === "loading") {
    return <div className="pixel-desktop-bg h-dvh w-full" />;
  }

  if (phase === "onboarding") {
    return <OnboardingScreen onStart={() => setPhase("desktop")} />;
  }

  function handleSelectApp(id: AppId) {
    const bounds = containerRef.current;
    openWindow(id, APP_DEFAULT_SIZE[id], bounds?.clientWidth ?? 1024, bounds?.clientHeight ?? 640);
  }

  const dayProgress = getDayProgress(clockMinutes, day);
  const ambientTint = getAmbientTint(dayProgress);

  return (
    <div className="pixel-desktop-bg flex h-dvh w-full flex-col">
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
            accentClassName="bg-accent-chattr/40"
            headerRight={<DmHeaderBadge />}
            containerRef={containerRef}
          >
            <ChattrApp />
          </DesktopWindow>
        )}
        {windows.pulse && (
          <DesktopWindow id="pulse" title="PULSE" accentClassName="bg-accent-pulse/40" containerRef={containerRef}>
            <PulseMock />
          </DesktopWindow>
        )}
        {windows.askClaude && (
          <DesktopWindow
            id="askClaude"
            title="ASK CLAUDE"
            accentClassName="bg-accent-help/40"
            containerRef={containerRef}
          >
            <AskClaudeApp />
          </DesktopWindow>
        )}
        {windows.reviews && (
          <DesktopWindow
            id="reviews"
            title="REVIEWS"
            accentClassName="bg-accent-reviews/40"
            containerRef={containerRef}
          >
            <ReviewsApp />
          </DesktopWindow>
        )}
        {windows.notes && (
          <DesktopWindow id="notes" title="NOTES" accentClassName="bg-accent-notes/40" containerRef={containerRef}>
            <NotesApp />
          </DesktopWindow>
        )}
        {windows.taskflow && (
          <DesktopWindow id="taskflow" title="TASKFLOW" accentClassName="bg-accent-taskflow/40" containerRef={containerRef}>
            <TaskflowApp />
          </DesktopWindow>
        )}
        {windows.office && (
          <DesktopWindow id="office" title="OFFICE" accentClassName="bg-accent-office/40" containerRef={containerRef}>
            <OfficeApp />
          </DesktopWindow>
        )}
      </div>

      <Taskbar openApps={openApps} onSelectApp={handleSelectApp} />

      {dayComplete && !scorecardDismissed && <DayScorecard onClose={() => setScorecardDismissed(true)} />}
    </div>
  );
}
