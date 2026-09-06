import Link from "next/link";
import { Hourglass, SkipForward } from "lucide-react";
import { useSimStore, formatSimTime } from "@/store/simStore";
import { getBatteryLevel, getDayProgress } from "@/lib/sim/timeOfDay";
import type { Difficulty } from "@/lib/sim/types";

/** Day-progress meter that drains toward the 6:00 PM hard end-of-day
 * boundary, so the clock's stakes are felt, not just stated in a corner. The
 * fill carries urgency via status tokens (comfortable -> warning -> critical)
 * on a muted, hairline, rounded-full track. */
function BatteryIndicator({ level }: { level: number }) {
  const pct = Math.round(level * 100);
  const fill = level > 0.5 ? "bg-status-success" : level > 0.2 ? "bg-status-pending" : "bg-status-failed";
  return (
    <div className="flex items-center gap-1.5" title={`~${pct}% of the day left`}>
      <Hourglass className="h-3 w-3 text-text-secondary" strokeWidth={2} aria-hidden="true" />
      <div className="h-1.5 w-16 overflow-hidden rounded-full border border-border-hairline bg-muted">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-caption tabular-nums text-text-secondary">{pct}%</span>
    </div>
  );
}

/** Top status bar, matching how real desktop OSes separate the menu/status
 * bar (top) from the app dock (bottom): system controls live here, the
 * dock (Taskbar) is purely for opening/switching apps.
 *
 * Presentational core: every reading and every handler arrives as a prop, so
 * the bar can be rendered outside a live session (handlers may be no-ops to
 * make the controls inert). `StatusBar` below is the store-connected wrapper
 * Desktop uses. */
export function StatusBarView({
  clockLabel,
  batteryLevel,
  difficulty,
  dayComplete,
  pendingReply = false,
  onToggleDifficulty,
  onSkipAhead,
}: {
  /** Right-hand clock readout, e.g. "Day 1 · 9:15 AM". */
  clockLabel: string;
  /** 0..1 fill for the remaining-day meter. */
  batteryLevel: number;
  difficulty: Difficulty;
  /** Shows the "Day 2 ready" link and stops +15m. */
  dayComplete: boolean;
  /** A reply is in flight, so +15m is held back. */
  pendingReply?: boolean;
  onToggleDifficulty: () => void;
  onSkipAhead: () => void;
}) {
  const skipDisabled = dayComplete || pendingReply;

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border-hairline bg-surface px-3">
      <div className="text-label font-semibold tracking-wide text-text-secondary">BAZAARLOOP</div>
      <div className="flex items-center gap-3">
        {/* DEMO/FILMING: pure nav link to the isolated /demo/day2 ad-shoot scaffolding — not a real day-advance trigger; remove with src/app/demo. */}
        {dayComplete && (
          <Link
            href="/demo/day2"
            className="flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-caption font-medium text-primary-foreground transition-colors hover:bg-primary/80"
            title="Continue to Day 2"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
            Day 2 ready
          </Link>
        )}
        <button
          onClick={onToggleDifficulty}
          className="rounded-full bg-muted px-2.5 py-1 text-caption font-medium text-text-secondary hover:text-text-primary"
          title="Toggle the easy-difficulty fact checklist in Chattr"
        >
          {difficulty === "easy" ? "EASY" : "STANDARD"}
        </button>
        <button
          onClick={() => !skipDisabled && onSkipAhead()}
          disabled={skipDisabled}
          className={`flex items-center gap-1 rounded-md border border-border-hairline bg-surface px-2 py-1 text-caption font-mono text-text-primary ${
            skipDisabled ? "cursor-not-allowed opacity-40" : "hover:bg-muted"
          }`}
          title={
            dayComplete
              ? "Day 1 is over."
              : pendingReply
                ? "Waiting on a reply…"
                : "Nothing to do right now? Skip ahead 15 simulated minutes."
          }
        >
          <SkipForward className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          +15m
        </button>
        <BatteryIndicator level={batteryLevel} />
        <div className="font-mono text-label tabular-nums text-text-primary">{clockLabel}</div>
      </div>
    </div>
  );
}

/** The status bar as the running sim uses it: same markup as StatusBarView,
 * with the clock, battery, difficulty and +15m wired to the sim store. */
export function StatusBar() {
  const clockMinutes = useSimStore((s) => s.clockMinutes);
  const day = useSimStore((s) => s.day);
  const batteryLevel = getBatteryLevel(getDayProgress(clockMinutes, day));
  const advanceClock = useSimStore((s) => s.advanceClock);
  const difficulty = useSimStore((s) => s.difficulty);
  const setDifficulty = useSimStore((s) => s.setDifficulty);
  // Reuses dayComplete rather than re-deriving the end-of-day boundary here:
  // it's true either from a real postmortem submission or the hard
  // end-of-day cutoff in advanceClock, and "+15m" should stop either way.
  const dayComplete = useSimStore((s) => s.dayComplete);
  // While an NPC reply is in flight, +15m can race sendPlayerMessage's own
  // awaits (see the pendingReplyFrom/pendingReplyChannel comment in
  // simStore.ts), disable it the same way MessageInput's Send button
  // already does (QA finding #12c).
  const pendingReplyFrom = useSimStore((s) => s.pendingReplyFrom);

  return (
    <StatusBarView
      clockLabel={`Day ${day} · ${formatSimTime(clockMinutes)}`}
      batteryLevel={batteryLevel}
      difficulty={difficulty}
      dayComplete={dayComplete}
      pendingReply={Boolean(pendingReplyFrom)}
      onToggleDifficulty={() => setDifficulty(difficulty === "easy" ? "standard" : "easy")}
      onSkipAhead={() => advanceClock(15)}
    />
  );
}
