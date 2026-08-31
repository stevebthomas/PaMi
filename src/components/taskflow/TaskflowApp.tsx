"use client";

import { useState } from "react";
import { useTaskflowStore, TIME_ADVANCE_MINUTES, type Ticket, type TicketStatus } from "@/store/taskflowStore";
import { useSimStore, formatSimTime } from "@/store/simStore";
import { ASSIGNABLE_TEAM, reporterLabel, rosterName, type AssigneeId } from "@/lib/sim/types";

const COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: "todo", label: "TO DO" },
  { status: "in-progress", label: "IN PROGRESS" },
  { status: "done", label: "DONE" },
];

function adjacent(status: TicketStatus, direction: -1 | 1): TicketStatus | null {
  const idx = COLUMNS.findIndex((c) => c.status === status);
  const next = COLUMNS[idx + direction];
  return next ? next.status : null;
}

/** Click-to-open assignee picker, front-and-center on the card itself (not a
 * settings menu): matches real Jira's "who's doing this right now" being
 * the info people scan for. Local open/closed state is fine here (unlike
 * the time-advance toast) since losing it on a column-move remount just
 * means the picker closes, which is what a move should do anyway. */
function AssigneePicker({ ticket, onAssign }: { ticket: Ticket; onAssign: (id: AssigneeId | null) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`pixel-border px-1.5 py-0.5 text-caption ${
          ticket.assigneeId ? "bg-accent-taskflow text-white" : "bg-bg-window text-ink-soft"
        }`}
        title="Assign this ticket"
      >
        {ticket.assigneeId ? rosterName(ticket.assigneeId) : "Unassigned"}
      </button>
      {open && (
        <div className="pixel-border absolute bottom-full right-0 z-10 mb-1 w-32 bg-white p-1 text-ink shadow-lg">
          {ticket.assigneeId && (
            <button
              onClick={() => {
                onAssign(null);
                setOpen(false);
              }}
              className="block w-full px-1.5 py-1 text-left text-caption text-ink-soft hover:bg-bg-window"
            >
              Unassign
            </button>
          )}
          {ASSIGNABLE_TEAM.map((member) => (
            <button
              key={member.id}
              onClick={() => {
                onAssign(member.id);
                setOpen(false);
              }}
              className="block w-full px-1.5 py-1 text-left text-caption hover:bg-bg-window"
            >
              {member.name}
              <span className="ml-1 text-ink-soft">{member.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketCard({ ticket, onTimeAdvance }: { ticket: Ticket; onTimeAdvance: () => void }) {
  const moveTicket = useTaskflowStore((s) => s.moveTicket);
  const creditTicketTime = useTaskflowStore((s) => s.creditTicketTime);
  const assignTicket = useTaskflowStore((s) => s.assignTicket);
  const advanceClock = useSimStore((s) => s.advanceClock);
  const clockMinutes = useSimStore((s) => s.clockMinutes);
  const left = adjacent(ticket.status, -1);
  const right = adjacent(ticket.status, 1);
  const reporter = reporterLabel(ticket.reporterId);

  // Only the specific ticket(s) flagged advancesTimeOnUpdate (today: the
  // tradeoff-decision ticket) advance the clock, and only once ever per
  // ticket: timeCredited is the anti-gaming guard against toggling the
  // same ticket back and forth for free time. This is deliberately NOT
  // inside taskflowStore's own moveTicket action (which stays store-only,
  // no dependency on simStore); the UI is what already coordinates both
  // stores elsewhere in this app (see FollowUpTicketPrompt), so that's
  // where this reaches for advanceClock too, the same real mechanism +15m
  // already uses.
  //
  // The confirmation itself is NOT local state on this card: a moved
  // ticket re-renders under a DIFFERENT column's parent <div> (todo/
  // in-progress/done are three separate filtered lists), so React
  // unmounts this exact instance and mounts a fresh one there. Any local
  // useState set right before that move is lost before it ever paints,
  // live-verified via the DOM, not a screenshot timing issue. onTimeAdvance
  // hands the "show a confirmation" decision up to TaskflowApp, which
  // stays mounted the whole time regardless of which column a card is in.
  function handleMove(target: TicketStatus) {
    moveTicket(ticket.id, target);
    if (ticket.advancesTimeOnUpdate && !ticket.timeCredited) {
      creditTicketTime(ticket.id);
      advanceClock(TIME_ADVANCE_MINUTES);
      onTimeAdvance();
    }
  }

  return (
    <div
      className={`pixel-border mb-2 p-2 text-label text-ink ${
        ticket.kind === "story" ? "border-l-4 border-l-accent-taskflow bg-accent-taskflow/10" : "bg-white"
      }`}
    >
      <div className="mb-1 font-semibold leading-snug">{ticket.title}</div>
      {ticket.description && <div className="mb-1 leading-snug text-ink-soft">{ticket.description}</div>}
      {reporter && <div className="mb-2 text-caption text-ink-soft">Reported by {reporter}</div>}
      <div className="flex items-center justify-between gap-1">
        <span className="text-caption text-ink-soft">{formatSimTime(ticket.createdAtSimMinutes)}</span>
        <div className="flex items-center gap-1">
          <AssigneePicker ticket={ticket} onAssign={(id) => assignTicket(ticket.id, id, clockMinutes)} />
          <button
            onClick={() => left && handleMove(left)}
            disabled={!left}
            className="pixel-border bg-bg-window px-1.5 py-0.5 text-caption font-pixel text-ink disabled:cursor-not-allowed disabled:opacity-30"
            title={left ? `Move to ${left}` : undefined}
          >
            ←
          </button>
          <button
            onClick={() => right && handleMove(right)}
            disabled={!right}
            className="pixel-border bg-bg-window px-1.5 py-0.5 text-caption font-pixel text-ink disabled:cursor-not-allowed disabled:opacity-30"
            title={right ? `Move to ${right}` : undefined}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

/** A minimal, real Kanban board: three columns, create a ticket, move it
 * between columns. Not gated behind easy difficulty (per the spec, this is
 * core Day 1, not an ambient-help feature). One or two tickets get seeded
 * automatically by the tradeoff decision (Feature B) and the postmortem
 * follow-up prompt (DayScorecard); this component itself just renders and
 * lets the player manage whatever's in useTaskflowStore. */
export function TaskflowApp() {
  const tickets = useTaskflowStore((s) => s.tickets);
  const addTicket = useTaskflowStore((s) => s.addTicket);
  const clockMinutes = useSimStore((s) => s.clockMinutes);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Owned here, not on the individual TicketCard: see the long comment on
  // TicketCard's handleMove for why a per-card confirmation silently never
  // rendered. TaskflowApp stays mounted regardless of which column any
  // given ticket ends up in, so this is the one place a "just happened"
  // confirmation can actually survive to be seen.
  const [timeAdvanceNotice, setTimeAdvanceNotice] = useState(false);

  function handleAdd() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    addTicket(trimmedTitle, description.trim(), clockMinutes, "todo", { reporterId: "player" });
    setTitle("");
    setDescription("");
  }

  function handleTimeAdvance() {
    setTimeAdvanceNotice(true);
    window.setTimeout(() => setTimeAdvanceNotice(false), 4000);
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b-2 border-ink bg-white p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="New ticket title…"
          className="pixel-border bg-white px-2 py-1 text-label text-ink outline-none"
        />
        <div className="flex gap-2">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Short description (optional)…"
            className="pixel-border flex-1 bg-white px-2 py-1 text-label text-ink outline-none"
          />
          <button
            onClick={handleAdd}
            className="pixel-border bg-accent-taskflow px-3 py-1 text-label font-pixel text-white hover:-translate-y-0.5"
          >
            + ADD
          </button>
        </div>
      </div>

      {timeAdvanceNotice && (
        <div className="shrink-0 border-b-2 border-ink bg-accent-pulse px-3 py-1.5 text-center font-pixel text-label text-white">
          LOGGED, +{TIME_ADVANCE_MINUTES} MIN
        </div>
      )}

      <div className="pixel-scrollbar grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto bg-[#dfd6bd] p-2">
        {COLUMNS.map((col) => (
          <div key={col.status} className="flex min-h-0 flex-col">
            <div className="mb-2 font-pixel text-caption text-ink-soft">
              {col.label} ({tickets.filter((t) => t.status === col.status).length})
            </div>
            <div className="pixel-scrollbar min-h-0 flex-1 overflow-y-auto">
              {tickets
                .filter((t) => t.status === col.status)
                .map((t) => (
                  <TicketCard key={t.id} ticket={t} onTimeAdvance={handleTimeAdvance} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
