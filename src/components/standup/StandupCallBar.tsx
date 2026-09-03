"use client";

import { Video } from "lucide-react";
import { useSimStore } from "@/store/simStore";
import { STANDUP_START_MINUTES, STANDUP_EXPIRE_MINUTES } from "@/lib/sim/standup";

/**
 * The quiet-but-noticeable "Join standup" affordance for the 9:00 call. A
 * floating pill just under the StatusBar, entirely UI-driven off the sim clock:
 * it shows only in the live standup window (9:00 -> 9:15) while the player
 * hasn't attended and the call overlay isn't already open, and disappears the
 * instant any of those stops holding — expiry at 9:15 (STANDUP_EXPIRE_MINUTES)
 * is when the non-join fallback digest posts to #general (see the `standup`
 * event). No wall-clock timer: visibility is a pure function of clockMinutes, so
 * a +15m jump past 9:15 simply never renders it.
 */
export function StandupCallBar() {
  const clockMinutes = useSimStore((s) => s.clockMinutes);
  const standupAttended = useSimStore((s) => s.stateBag.standupAttended);
  const standupCallOpen = useSimStore((s) => s.standupCallOpen);
  const dayComplete = useSimStore((s) => s.dayComplete);
  const joinStandup = useSimStore((s) => s.joinStandup);

  const live =
    clockMinutes >= STANDUP_START_MINUTES &&
    clockMinutes < STANDUP_EXPIRE_MINUTES &&
    !standupAttended &&
    !standupCallOpen &&
    !dayComplete;
  if (!live) return null;

  return (
    // Outer wrapper is click-through; only the pill itself is interactive, so
    // the bar never steals clicks from the desktop underneath it.
    <div className="pointer-events-none fixed left-1/2 top-12 z-40 -translate-x-1/2">
      <div className="animate-standup-enter pointer-events-auto flex items-center gap-3 rounded-full border border-border-hairline bg-surface px-3 py-2 shadow-lg">
        <span className="flex items-center gap-2 pl-1 text-label text-text-secondary">
          <span className="inline-block size-2 rounded-full bg-accent-green" aria-hidden />
          Daily standup · 9:00 AM
        </span>
        <button
          type="button"
          onClick={joinStandup}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent-green px-3 py-1.5 text-label font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Video className="size-3.5" aria-hidden />
          Join standup
        </button>
      </div>
    </div>
  );
}
