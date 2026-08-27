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
  const [onboarded, setOnboarded] = useState(false);
  const [scorecardDismissed, setScorecardDismissed] = useState(false);
  const startDay = useSimStore((s) => s.startDay);
  const dayComplete = useSimStore((s) => s.dayComplete);
  const day = useSimStore((s) => s.day);
  const clockMinutes = useSimStore((s) => s.clockMinutes);
  const windows = useWindowStore((s) => s.windows);
  const openWindow = useWindowStore((s) => s.openWindow);
  const containerRef = useRef<HTMLDivElement>(null);

  const openApps = useMemo(() => new Set(Object.keys(windows) as AppId[]), [windows]);

  // Dev-only console hook so the API call/cost tracker is inspectable
  // without a debug panel — call getSessionCostSummary() in devtools.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { getSessionCostSummary: typeof getSessionCostSummary }).getSessionCostSummary = getSessionCostSummary;
    }
  }, []);

  useEffect(() => {
    if (!onboarded) return;
    startDay();
    // Open Chattr by default so the player isn't dropped on an empty desktop.
    const bounds = containerRef.current;
    openWindow("chattr", APP_DEFAULT_SIZE.chattr, bounds?.clientWidth ?? 1024, bounds?.clientHeight ?? 640);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarded]);

  if (!onboarded) {
    return <OnboardingScreen onStart={() => setOnboarded(true)} />;
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
