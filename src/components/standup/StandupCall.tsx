"use client";

import { useEffect } from "react";
import { LogOut } from "lucide-react";
import { useSimStore, formatSimTime } from "@/store/simStore";
import { PixelAvatar } from "@/components/shared/PixelAvatar";
import { renderInline } from "@/components/shared/renderInline";
import { AGENT_NAMES, type AgentId } from "@/lib/sim/types";
import { standupSpeakerLines, STANDUP_ATTENDEE_IDS } from "@/lib/sim/standup";

/**
 * The 9:00 standup CALL overlay: a full-shell scrim (covers the StatusBar too,
 * so +15m can't advance the clock mid-call) with a call-flavored surface — the
 * attendee row of PixelAvatars plus the player, and the standup dialogue as
 * sequential speaker lines. The lines come from the SAME continuity-conditioned
 * source (standupSpeakerLines) that the #general digest and the saved doc render
 * from, so what's said on the call, what posts to #general, and what lands in
 * Docs can never drift. "Leave standup" exits (leaveStandup posts the summary +
 * saves the notes). Entrance is a quiet fade/scale-in that respects
 * prefers-reduced-motion (see .animate-standup-enter in globals.css).
 */
export function StandupCall() {
  const open = useSimStore((s) => s.standupCallOpen);
  const stateBag = useSimStore((s) => s.stateBag);
  const clockMinutes = useSimStore((s) => s.clockMinutes);
  const leaveStandup = useSimStore((s) => s.leaveStandup);

  // Esc leaves the call, matching the desktop's general modal ergonomics.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") leaveStandup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, leaveStandup]);

  if (!open) return null;

  const playerName = (typeof stateBag.playerName === "string" ? stateBag.playerName.trim() : "") || "You";
  const lines = standupSpeakerLines(stateBag);
  const attendees: AgentId[] = [...STANDUP_ATTENDEE_IDS, "player"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="animate-standup-enter flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-card)] border border-border-hairline bg-surface shadow-lg">
        {/* Header + the explicit exit control. */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-hairline px-5 py-4">
          <div className="min-w-0">
            <div className="text-subheading font-semibold tracking-tight text-text-primary">Daily Standup</div>
            <div className="mt-0.5 text-label text-text-secondary">Day 1 · {formatSimTime(clockMinutes)}</div>
          </div>
          <button
            type="button"
            onClick={leaveStandup}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-accent-green px-3 py-1.5 text-label font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <LogOut className="size-3.5" aria-hidden />
            Leave standup
          </button>
        </div>

        {/* Attendee row: everyone canon puts at standup, plus the player. */}
        <div className="flex shrink-0 flex-wrap items-start gap-4 border-b border-border-hairline bg-canvas px-5 py-4">
          {attendees.map((id) => (
            <div key={id} className="flex w-14 flex-col items-center gap-1.5">
              <PixelAvatar agentId={id} sizeClassName="h-12 w-12" />
              <span className="w-full truncate text-center text-caption text-text-secondary">
                {id === "player" ? playerName : AGENT_NAMES[id]}
              </span>
            </div>
          ))}
        </div>

        {/* The standup dialogue, in order. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ul className="space-y-3">
            {lines.map((l, i) => (
              <li key={i} className="flex gap-2">
                <PixelAvatar agentId={l.agentId} sizeClassName="h-8 w-8" />
                <div className="min-w-0">
                  <div className="text-body font-semibold text-text-primary">{l.speaker}</div>
                  <p className="whitespace-pre-wrap text-body leading-snug text-text-secondary">{renderInline(l.text)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
