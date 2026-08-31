"use client";

import { useRef, useState } from "react";
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
    <div className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        // block + w-full lets this chip shrink with its flex-1 min-w-0
        // wrapper in TicketCard's bottom row (instead of forcing the row
        // wider than the card); truncate is the fallback for when the
        // chip's name genuinely doesn't fit next to the move buttons.
        className={`pixel-border block w-full truncate px-1.5 py-0.5 text-left text-caption ${
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
      <div className="mb-1 break-words font-semibold leading-snug">{ticket.title}</div>
      {/* FIRST casualty on a narrow card: hidden below an arbitrary @[12rem]
          (192px) COLUMN width, via the @container on each column in
          TaskflowApp. Tailwind's nearest preset (@xs = 20rem/320px) over-fired:
          it hid descriptions even at the default window (700px, ~215px
          columns). 12rem sits between the default 215px columns (description
          shows) and the window-floor ~150px columns (description hides). */}
      {ticket.description && (
        <div className="mb-1 hidden leading-snug text-ink-soft @[12rem]:block">{ticket.description}</div>
      )}
      {reporter && <div className="mb-2 text-caption text-ink-soft">Reported by {reporter}</div>}
      {/* Bottom row is the one that must never clip, all the way to the
          window floor: flex-wrap is the last-resort escape hatch (timestamp
          can drop to its own line), the assignee chip is the only flexible,
          truncatable element (min-w-0 flex-1), and the move buttons are
          shrink-0 so they always render at full, clickable size. */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="shrink-0 text-caption text-ink-soft">{formatSimTime(ticket.createdAtSimMinutes)}</span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <div className="min-w-0 flex-1">
            <AssigneePicker ticket={ticket} onAssign={(id) => assignTicket(ticket.id, id, clockMinutes)} />
          </div>
          <button
            onClick={() => left && handleMove(left)}
            disabled={!left}
            className="pixel-border shrink-0 bg-bg-window px-1.5 py-0.5 text-caption font-pixel text-ink disabled:cursor-not-allowed disabled:opacity-30"
            title={left ? `Move to ${left}` : undefined}
          >
            ←
          </button>
          <button
            onClick={() => right && handleMove(right)}
            disabled={!right}
            className="pixel-border shrink-0 bg-bg-window px-1.5 py-0.5 text-caption font-pixel text-ink disabled:cursor-not-allowed disabled:opacity-30"
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
  const titleRef = useRef<HTMLInputElement>(null);
  const canAdd = title.trim().length > 0;
  // Owned here, not on the individual TicketCard: see the long comment on
  // TicketCard's handleMove for why a per-card confirmation silently never
  // rendered. TaskflowApp stays mounted regardless of which column any
  // given ticket ends up in, so this is the one place a "just happened"
  // confirmation can actually survive to be seen.
  const [timeAdvanceNotice, setTimeAdvanceNotice] = useState(false);

  function handleAdd() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      titleRef.current?.focus();
      return;
    }
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
          ref={titleRef}
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
            disabled={!canAdd}
            title={canAdd ? "Add ticket" : "Give the ticket a title first."}
            className="pixel-border bg-accent-taskflow px-3 py-1 text-label font-pixel text-white hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
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
          // min-w-0 on both this grid item and the flex-col children below is
          // what actually fixes the clipping: without it, a grid/flex item's
          // default min-width is its content's min-content size, so a card
          // whose bottom row doesn't fit was forcing the column (and the
          // buttons riding along with it) wider than the 1fr track, clipped
          // by the window's own edge instead of reflowing. @container keys
          // the description breakpoint below to this column's actual width.
          <div key={col.status} className="@container flex min-h-0 min-w-0 flex-col">
            <div className="mb-2 font-pixel text-caption text-ink-soft">
              {col.label} ({tickets.filter((t) => t.status === col.status).length})
            </div>
            <div className="pixel-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto">
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
