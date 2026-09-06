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
import { DocWindow } from "../docs/DocWindow";
import { StandupCallBar } from "../standup/StandupCallBar";
import { StandupCall } from "../standup/StandupCall";
import { FileText } from "lucide-react";
import { APP_DEFAULT_SIZE, APP_MIN_SIZE, type AppId } from "./appWindows";
import { resolveSimDoc } from "@/data/simDocs";
import { useSimStore } from "@/store/simStore";
import {
  docIdFromWindowId,
  docWindowId,
  isDocWindowId,
  useWindowStore,
  type WindowId,
} from "@/store/windowStore";
import { useDocsStore } from "@/store/docsStore";
import { getSessionCostSummary } from "@/store/costStore";
import { getAmbientTint, getDayProgress } from "@/lib/sim/timeOfDay";
import { restoreSession, startSessionPersistence, resetSession } from "@/lib/sim/sessionPersistence";

/* The AppId union and the two per-app size tables now live in ./appWindows so
 * they can be imported as plain data (the ad-mode filming route needs the
 * defaults/minimums) without dragging this module's whole graph along. They are
 * re-exported here under their existing names, so `AppId`, `APP_DEFAULT_SIZE`
 * and `APP_MIN_SIZE` keep resolving from "@/components/desktop/Desktop" exactly
 * as before for every existing importer. */
export type { AppId };
export { APP_DEFAULT_SIZE, APP_MIN_SIZE };

/** Size for a document's own window (keyed `doc:${docId}`). Not an AppId, so it
 * lives outside the APP_* tables: a comfortable reading default that cascades
 * on top of the library, with a floor that keeps the prose column readable. */
const DOC_WINDOW_SIZE = {
  default: { width: 520, height: 420 },
  min: { width: 300, height: 240 },
} as const;

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
  // Session-generated docs (e.g. the 9:00 standup notes) resolve alongside the
  // static registry when opening a doc window.
  const sessionDocs = useSimStore((s) => s.stateBag.sessionDocs);
  const windows = useWindowStore((s) => s.windows);
  const openWindow = useWindowStore((s) => s.openWindow);
  // Docs launch signal: the docsStore plays the dock-bounce, then queues the
  // docIds so Desktop (the only caller of openWindow with real desk bounds)
  // opens each doc's own window centered/cascaded like every other window.
  const docsPendingOpenIds = useDocsStore((s) => s.pendingOpenDocIds);
  const clearDocsPendingOpen = useDocsStore((s) => s.clearPendingOpen);
  const containerRef = useRef<HTMLDivElement>(null);

  // Taskbar/app logic is app-only: doc windows (keyed `doc:${docId}`) never
  // become taskbar tiles, so filter them out of the openApps set. What remains
  // is exactly the static AppId keys, so the cast is sound.
  const openApps = useMemo(
    () =>
      new Set(
        (Object.keys(windows) as WindowId[]).filter((id) => !isDocWindowId(id)) as AppId[]
      ),
    [windows]
  );

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

  // Opens each queued doc's own window once the docsStore's launch choreography
  // hands over the docIds. Kept here (not in the store) so openWindow is still
  // only ever called with real containerRef desk dimensions: each doc window
  // then centers/cascades exactly like every other window. Draining the queue
  // after is idempotent under StrictMode (openWindow brings-to-front if already
  // open), and each doc gets a distinct `doc:${docId}` key so multiple docs
  // become multiple independent windows.
  useEffect(() => {
    if (docsPendingOpenIds.length === 0) return;
    const bounds = containerRef.current;
    const deskWidth = bounds?.clientWidth ?? 1024;
    const deskHeight = bounds?.clientHeight ?? 640;
    for (const docId of docsPendingOpenIds) {
      openWindow(docWindowId(docId), DOC_WINDOW_SIZE.default, deskWidth, deskHeight);
    }
    clearDocsPendingOpen();
  }, [docsPendingOpenIds, openWindow, clearDocsPendingOpen]);

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
        onStart={(name, avatarId) => {
          useSimStore.getState().setPlayerName(name);
          useSimStore.getState().setPlayerAvatarId(avatarId);
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
        {/* One independent window per open document. The windows map is the sole
            source of truth for which docs are open, so closeWindow (the X) is
            the single close path — no docsStore mirror to desync. An unknown
            docId (e.g. a stale key) resolves to no SimDoc and renders nothing. */}
        {(Object.keys(windows) as WindowId[]).filter(isDocWindowId).map((wid) => {
          const docId = docIdFromWindowId(wid);
          const doc = docId ? resolveSimDoc(docId, sessionDocs) : undefined;
          if (!doc) return null;
          return (
            <DesktopWindow
              key={wid}
              id={wid}
              title={doc.title}
              icon={<FileText className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
              containerRef={containerRef}
              minSize={DOC_WINDOW_SIZE.min}
            >
              <DocWindow doc={doc} />
            </DesktopWindow>
          );
        })}
      </div>

      <Taskbar openApps={openApps} onSelectApp={handleSelectApp} />

      {/* 9:00 standup: the Join affordance (quiet floating bar) shows only in
          its live window, and the call overlay covers the whole shell (StatusBar
          included, so +15m can't advance the clock mid-call). Both are inert
          outside the standup window / when not open. */}
      <StandupCallBar />
      <StandupCall />

      {dayComplete && !scorecardDismissed && <DayScorecard onClose={dismissScorecard} />}
    </div>
  );
}
