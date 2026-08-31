import { useSimStore, formatSimTime } from "@/store/simStore";
import { getBatteryLevel, getDayProgress } from "@/lib/sim/timeOfDay";

/** Laptop-style battery icon that drains toward the 6:00 PM hard end-of-day
 * boundary, so the clock's stakes are felt, not just stated in a corner. */
function BatteryIndicator({ level }: { level: number }) {
  const pct = Math.round(level * 100);
  const color = level > 0.5 ? "bg-accent-pulse" : level > 0.2 ? "bg-accent-taskflow" : "bg-accent-danger";
  return (
    <div className="flex items-center gap-1.5" title={`~${pct}% of the day left`}>
      <div className="flex h-4 w-8 items-center border-2 border-ink bg-bg-window p-[1.5px]">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="h-2 w-[3px] bg-ink" />
      <span className="font-pixel text-caption text-ink">{pct}%</span>
    </div>
  );
}

/** Top status bar, matching how real desktop OSes separate the menu/status
 * bar (top) from the app dock (bottom): system controls live here, the
 * dock (Taskbar) is purely for opening/switching apps. */
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
  const skipDisabled = dayComplete || Boolean(pendingReplyFrom);

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b-2 border-ink bg-bg-taskbar px-3">
      <div className="font-pixel text-caption text-ink-soft">BAZAARLOOP</div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setDifficulty(difficulty === "easy" ? "standard" : "easy")}
          className="pixel-border bg-bg-window px-2 py-1 text-caption font-pixel text-ink hover:-translate-y-0.5"
          title="Toggle the easy-difficulty fact checklist in Chattr"
        >
          {difficulty === "easy" ? "EASY" : "STANDARD"}
        </button>
        <button
          onClick={() => !skipDisabled && advanceClock(15)}
          disabled={skipDisabled}
          className={`pixel-border bg-bg-window px-2 py-1 text-caption font-pixel text-ink ${
            skipDisabled ? "cursor-not-allowed opacity-40" : "hover:-translate-y-0.5"
          }`}
          title={
            dayComplete
              ? "Day 1 is over."
              : pendingReplyFrom
                ? "Waiting on a reply…"
                : "Nothing to do right now? Skip ahead 15 simulated minutes."
          }
        >
          ⏭ +15m
        </button>
        <BatteryIndicator level={batteryLevel} />
        <div className="pixel-border bg-bg-window px-3 py-1 text-label font-pixel text-ink">
          Day {day} · {formatSimTime(clockMinutes)}
        </div>
      </div>
    </div>
  );
}
