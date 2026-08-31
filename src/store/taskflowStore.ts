import { create } from "zustand";
import type { AssigneeId, ReporterId, Ticket, TicketStatus } from "@/lib/sim/types";

export type { Ticket, TicketStatus, TicketKind } from "@/lib/sim/types";

interface TaskflowState {
  tickets: Ticket[];
  addTicket: (
    title: string,
    description: string,
    createdAtSimMinutes: number,
    status?: TicketStatus,
    opts?: { kind?: Ticket["kind"]; advancesTimeOnUpdate?: boolean; reporterId?: ReporterId }
  ) => string;
  moveTicket: (id: string, status: TicketStatus) => void;
  /** Marks a ticket's time-advance as already credited: called by the UI
   * (not moveTicket itself) right before it separately calls
   * useSimStore's advanceClock, so the store stays free of any dependency
   * on simStore (avoiding a store-to-store circular import) while still
   * keeping the "already credited" state durable and ticket-scoped rather
   * than tracked ad hoc in component state. */
  creditTicketTime: (id: string) => void;
  /** Assigns (or, with null, unassigns) a ticket: see TicketCard's
   * assignee picker in TaskflowApp.tsx. Stamps assignedAtSimMinutes so
   * scorecard.ts's assignment_quality signal can read time-to-assign. */
  assignTicket: (id: string, assigneeId: AssigneeId | null, atSimMinutes: number) => void;
}

/** Minutes advanced for a qualifying story-ticket action (see
 * advancesTimeOnUpdate/timeCredited above): one shared constant so
 * TicketCard's move handler and DayScorecard's FollowUpTicketPrompt can't
 * drift to two different numbers, and so the on-screen confirmation text
 * always matches what actually happened to the clock. */
export const TIME_ADVANCE_MINUTES = 12;

let idCounter = 0;
function makeTicketId(): string {
  idCounter += 1;
  return `ticket-${Date.now()}-${idCounter}`;
}

/** Minimal Taskflow board: separate from simStore since it's a fairly
 * self-contained feature, but tickets are still timestamped in sim-minutes
 * so they sort/read consistently with everything else in the day. */
export const useTaskflowStore = create<TaskflowState>((set) => ({
  tickets: [],
  addTicket: (title, description, createdAtSimMinutes, status = "todo", opts) => {
    const id = makeTicketId();
    set((s) => ({
      tickets: [
        ...s.tickets,
        {
          id,
          title,
          description,
          status,
          createdAtSimMinutes,
          kind: opts?.kind ?? "freeform",
          advancesTimeOnUpdate: opts?.advancesTimeOnUpdate,
          reporterId: opts?.reporterId ?? null,
          assigneeId: null,
        },
      ],
    }));
    return id;
  },
  moveTicket: (id, status) => {
    set((s) => ({
      tickets: s.tickets.map((t) => (t.id === id ? { ...t, status } : t)),
    }));
  },
  creditTicketTime: (id) => {
    set((s) => ({
      tickets: s.tickets.map((t) => (t.id === id ? { ...t, timeCredited: true } : t)),
    }));
  },
  assignTicket: (id, assigneeId, atSimMinutes) => {
    set((s) => ({
      tickets: s.tickets.map((t) => (t.id === id ? { ...t, assigneeId, assignedAtSimMinutes: atSimMinutes } : t)),
    }));
  },
}));
