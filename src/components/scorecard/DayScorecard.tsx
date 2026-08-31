"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { useSimStore } from "@/store/simStore";
import { useTaskflowStore, TIME_ADVANCE_MINUTES } from "@/store/taskflowStore";
import { useCostStore } from "@/store/costStore";
import { AppIcon } from "@/components/shared/AppIcon";
import { ScorecardDetail } from "./ScorecardDetail";

/** Same fetch-wrapper-in-the-component pattern HROrientationChat.tsx uses
 * for Sam's replies: this is a one-off, view-local suggestion, not a
 * simStore mutation, so it doesn't need a store action. */
async function requestFollowUpTicketSuggestion(postmortemText: string): Promise<string | null> {
  try {
    const res = await fetch("/api/agents/suggest-followup-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postmortemText }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.usage) {
      useCostStore.getState().recordCall({ callType: "suggest-followup", ...data.usage });
    }
    return typeof data.title === "string" ? data.title : null;
  } catch {
    return null;
  }
}

/** Small, optional prompt letting the player turn their own "what I'd do
 * differently" into an actual Taskflow ticket, so that recommendation
 * leads somewhere instead of just sitting in the postmortem text. Only
 * shown when there's a real postmortem to draw from. The title is
 * pre-filled from the postmortem itself (see requestFollowUpTicketSuggestion)
 * so closing this loop is one continuous action, not a re-typing chore.
 * Also gives commClarity a small bump and adds a coaching note when used
 * (see recordFollowUpTicket), since actually tracking a recommendation is a
 * real follow-through signal, not a decorative click. */
function FollowUpTicketPrompt({ day, postmortemText, completedAtSimMinutes }: { day: number; postmortemText: string; completedAtSimMinutes: number }) {
  const addTicket = useTaskflowStore((s) => s.addTicket);
  const recordFollowUpTicket = useSimStore((s) => s.recordFollowUpTicket);
  const advanceClock = useSimStore((s) => s.advanceClock);
  const [title, setTitle] = useState("");
  const [suggesting, setSuggesting] = useState(true);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    requestFollowUpTicketSuggestion(postmortemText).then((suggestion) => {
      if (cancelled) return;
      if (suggestion) setTitle(suggestion);
      setSuggesting(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (added) {
    return (
      <div className="mt-4 rounded-[var(--radius-card)] border border-border-hairline bg-surface p-3 text-label text-text-secondary">
        Added to Taskflow.{" "}
        <span className="font-medium text-accent-green">Advanced the clock {TIME_ADVANCE_MINUTES} min.</span>
      </div>
    );
  }

  function handleAdd() {
    const trimmed = title.trim();
    if (!trimmed) return;
    addTicket(trimmed, "Follow-up from the Day 1 postmortem.", completedAtSimMinutes, "todo", { kind: "story", reporterId: "player" });
    recordFollowUpTicket(day, trimmed);
    // Creating this ticket IS the meaningful action (unlike the
    // tradeoff-decision ticket, which advances time on its later move, not
    // its auto-seeded creation), advance once here. Naturally single-fire:
    // `added` below immediately hides this control after one use, and that
    // same replacement state is what carries the visible confirmation.
    advanceClock(TIME_ADVANCE_MINUTES);
    setAdded(true);
  }

  return (
    <div className="mt-4 rounded-[var(--radius-card)] border border-border-hairline bg-surface p-3">
      <div className="mb-2 flex items-center gap-2 text-text-secondary">
        <AppIcon id="taskflow" sizeClassName="h-4 w-4" />
        <div className="text-caption font-semibold tracking-wide">TURN A &ldquo;WHAT I&apos;D DO DIFFERENTLY&rdquo; INTO A TICKET?</div>
      </div>
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder={suggesting ? "Pulling a suggestion from your postmortem…" : "e.g. Set up Stripe webhook monitoring"}
          className="flex-1 rounded-[var(--radius-control)] border border-border-hairline bg-canvas px-2.5 py-1.5 text-body text-text-primary outline-none placeholder:text-text-secondary focus:border-accent-green"
        />
        <button
          onClick={handleAdd}
          className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-control)] bg-accent-green px-3 py-1.5 text-label font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-3.5" aria-hidden />
          Add
        </button>
      </div>
    </div>
  );
}

export function DayScorecard({ onClose }: { onClose: () => void }) {
  const dayRecords = useSimStore((s) => s.dayRecords);
  const record = dayRecords[dayRecords.length - 1];
  if (!record) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-card)] border border-border-hairline bg-surface shadow-lg">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-hairline px-5 py-4">
          <div className="min-w-0">
            <div className="text-subheading font-semibold tracking-tight text-text-primary">Day {record.day} complete</div>
            <div className="mt-0.5 text-label text-text-secondary">Scorecard: {record.scenarioLabel}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scorecard"
            className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border-hairline bg-surface text-text-secondary hover:bg-muted hover:text-text-primary"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-canvas p-5">
          <ScorecardDetail record={record} />

          {record.postmortemText && (
            <FollowUpTicketPrompt day={record.day} postmortemText={record.postmortemText} completedAtSimMinutes={record.completedAtSimMinutes} />
          )}

          <div className="mt-4 text-center text-label text-text-secondary">
            Days 2-5 aren&apos;t built yet, this is the Day 1 proof of concept. Find this scorecard
            again anytime in Reviews.
          </div>
        </div>
      </div>
    </div>
  );
}
