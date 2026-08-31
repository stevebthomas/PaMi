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
  const label = ticket.assigneeId ? rosterName(ticket.assigneeId) : "Unassigned";
  // Compact-tier glyph: the assignee's first initial, or an en dash for
  // unassigned (a plain "U" would misread as someone's actual initial).
  const compactGlyph = ticket.assigneeId ? label.charAt(0).toUpperCase() : "–";
  const chipColorClass = ticket.assigneeId ? "bg-accent-taskflow text-white" : "bg-bg-window text-ink-soft";

  return (
    // flex + justify-end keeps whichever tier is visible hugging the move
    // buttons (instead of drifting left inside the flex-1 wrapper below),
    // so the gap-1 spacing to the arrows stays consistent at every width.
    // min-w-0 is gated to the full tier (@[12rem]:min-w-0), not applied
    // unconditionally: the compact button is a fixed, non-shrinking size,
    // so letting an ancestor claim "I can go to 0" below 12rem was a lie —
    // it fooled TicketCard's outer row into skipping its flex-wrap escape
    // valve (the row's hypothetical min size looked like ~0), so instead
    // of wrapping, the compact chip's real content just overflowed this
    // zeroed box and painted over the timestamp next to it. See TicketCard.
    <div className="relative flex justify-end @[12rem]:min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        // Full-tier chip: >=12rem column width, matching the description's
        // @[12rem]:block breakpoint below (this is the same tier where a
        // description already fits, so a roster name does too). min-w is a
        // floor against being squashed thin; truncate (nowrap+ellipsis) is
        // only a fallback for a name that still overflows at this width,
        // never the mid-word sliver the single-chip version produced below
        // 12rem.
        className={`pixel-border hidden w-full min-w-[3.5rem] truncate px-1.5 py-0.5 text-left text-caption @[12rem]:block ${chipColorClass}`}
        title={label}
      >
        {label}
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        // Compact-tier chip: below 12rem, a fixed roughly-square button
        // (same pixel-border styling/click behavior) replaces the full chip
        // instead of letting it truncate to an unreadable sliver that
        // collided with the ← button.
        className={`pixel-border inline-flex shrink-0 items-center justify-center px-1.5 py-0.5 text-caption @[12rem]:hidden ${chipColorClass}`}
        title={label}
      >
        {compactGlyph}
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
          truncatable element, and the move buttons are shrink-0 so they
          always render at full, clickable size.
          The timestamp itself is two-tier, same @[12rem] breakpoint as the
          description/chip above: below 12rem the AM/PM suffix drops
          ("9:15"), since a fixed-size compact chip plus two arrow buttons
          leaves too little room for "9:15 AM" to coexist without wrapping.
          min-w-0 on the two wrappers below is now gated to @[12rem] too
          (was unconditional): applied below 12rem it let these wrappers
          claim a false "can shrink to 0" to the flex-wrap algorithm even
          though the compact chip inside can't actually shrink, so instead
          of wrapping, the chip's real size just overflowed the zeroed box
          and painted over the timestamp next to it. Gating it keeps that
          truncation behavior for the full chip at >=12rem, while letting
          the compact chip's real minimum size be seen below 12rem so this
          row's flex-wrap genuinely engages (timestamp onto its own line)
          instead of overlapping if content still doesn't fit on one line. */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="shrink-0 text-caption text-ink-soft @[12rem]:hidden" title={formatSimTime(ticket.createdAtSimMinutes)}>
          {formatSimTime(ticket.createdAtSimMinutes).replace(/ (AM|PM)$/, "")}
        </span>
        <span className="hidden shrink-0 text-caption text-ink-soft @[12rem]:inline">
          {formatSimTime(ticket.createdAtSimMinutes)}
        </span>
        <div className="flex flex-1 items-center justify-end gap-1 @[12rem]:min-w-0">
          <div className="flex-1 @[12rem]:min-w-0">
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
