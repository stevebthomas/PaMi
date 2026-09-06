"use client";
/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL AD/GAME CONTENT — safe to delete after ad shoot is done.
 *
 * Pixel-faithful LOOKALIKES of the real Chattr / Pulse / Office / Taskflow
 * window bodies. The Tailwind classes are copied from the real components
 * (ChannelList, MessageList, PulseMock, OfficeApp) but nothing here is wired to
 * the game: every value arrives as a prop from script.ts. Hardcoded for
 * filming, no real logic.
 *
 * The only real app component imported anywhere in this folder is the pure
 * window chrome (Window) and the pure sparkline (RateSparkline), both of which
 * are prop-driven and store-free.
 */

import { useEffect, useRef } from "react";
import { RateSparkline } from "@/components/charts/RateSparkline";
import {
  CHANNELS,
  DIRECT_MESSAGES,
  INCIDENT_MINUTE,
  formatClock,
  type ChannelId,
  type ChattrMessage,
  type PulseState,
} from "./script";

/* ------------------------------------------------------------------ shared */

/** Initial-circle avatar, same idiom as the day2 shot. */
function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-label font-semibold text-text-secondary">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

/* ------------------------------------------------------------------ Chattr */

function SidebarRow({
  label,
  active,
  unread,
}: {
  label: string;
  active: boolean;
  unread: boolean;
}) {
  return (
    <div
      className={`mb-1 flex items-center justify-between rounded-md px-2 py-1 text-left ${
        active ? "bg-muted text-text-primary" : "text-text-secondary"
      } ${unread ? "ring-1 ring-inset ring-accent-green" : ""}`}
    >
      <span className={unread ? "font-semibold" : ""}>{label}</span>
      {unread && <span className="h-2 w-2 rounded-full bg-accent-green" />}
    </div>
  );
}

export function FakeChattr({
  activeChannel,
  unread,
  messages,
}: {
  activeChannel: ChannelId;
  unread: ChannelId[];
  messages: ChattrMessage[];
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keeps the newest scripted line in frame when a beat appends to a long
  // thread, so the camera never has to chase a scrollbar.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, activeChannel]);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex h-full w-44 shrink-0 flex-col overflow-y-auto border-r border-border-hairline bg-canvas p-2 text-body">
        <div className="mb-1 mt-1 px-2 text-label font-semibold uppercase tracking-wide text-text-secondary">
          CHANNELS
        </div>
        {CHANNELS.map((c) => (
          <SidebarRow
            key={c.id}
            label={c.label}
            active={activeChannel === c.id}
            unread={unread.includes(c.id)}
          />
        ))}
        <div className="mb-1 mt-3 px-2 text-label font-semibold uppercase tracking-wide text-text-secondary">
          DIRECT MESSAGES
        </div>
        {DIRECT_MESSAGES.map((c) => (
          <SidebarRow
            key={c.id}
            label={c.label}
            active={activeChannel === c.id}
            unread={unread.includes(c.id)}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-body text-text-secondary">Nothing here yet.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="mb-3 flex gap-2">
            <Avatar name={m.sender} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-body font-semibold text-text-primary">{m.sender}</span>
                <span className="font-pixel text-label tabular-nums text-text-secondary">
                  {m.time}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-body leading-snug text-text-primary">
                {m.text}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Pulse */

/** The failure tile goes red at or above 9%. Everything below that reads
 * neutral. Scripted threshold, no real logic. */
const FAILURE_ALARM_THRESHOLD = 9;

export function FakePulse({ pulse }: { pulse: PulseState }) {
  const alarming = pulse.rate >= FAILURE_ALARM_THRESHOLD;
  // RateSparkline scales its y-range against baselineRate, so hand it the peak
  // of the scripted series to keep the whole hump inside the chart box.
  const baselineRate = Math.max(...pulse.history.map((h) => h.rate));
  // The chart is coloured by the last RECORDED sample, not by the tile number.
  // They differ on exactly one beat (the misread, where the tile shows 3.1%
  // over an unchanged series) and the line should keep telling the truth about
  // the series it is actually drawing.
  const lastSample = pulse.history[pulse.history.length - 1];
  const lineAlarming = lastSample.rate >= FAILURE_ALARM_THRESHOLD;

  return (
    <div className="h-full w-full overflow-y-auto bg-canvas p-4 text-text-primary">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-subheading font-semibold tracking-tight text-text-primary">Pulse</div>
        <div className="font-pixel text-caption tabular-nums text-text-secondary">
          data as of {formatClock(pulse.t)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <section
          className={`rounded-[var(--radius-card)] border border-border-hairline bg-surface p-4 ${
            alarming ? "border-t-2 border-t-status-failed" : ""
          }`}
        >
          <div className="flex items-center gap-2 text-label text-text-secondary">
            <span className="relative flex h-1.5 w-1.5">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                  alarming ? "bg-status-failed" : "bg-accent-green"
                }`}
              />
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                  alarming ? "bg-status-failed" : "bg-accent-green"
                }`}
              />
            </span>
            Checkout failure rate
          </div>
          <div
            className={`mt-2 text-display font-bold tabular-nums leading-none tracking-tight ${
              alarming ? "text-status-failed" : "text-text-primary"
            }`}
          >
            {pulse.rate.toFixed(1)}%
          </div>
          <div className="mt-3">
            <RateSparkline
              history={pulse.history}
              dayStart={510}
              dayEnd={1080}
              incidentStartMinutes={lastSample.t >= INCIDENT_MINUTE ? INCIDENT_MINUTE : null}
              tradeoffDecidedAtMinutes={null}
              clockMinutes={lastSample.t}
              baselineRate={baselineRate}
              colorVar={lineAlarming ? "--color-status-failed" : "--color-accent-green"}
              formatTime={formatClock}
            />
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] border border-border-hairline bg-surface p-4">
          <div className="text-label text-text-secondary">Checkout attempts (today)</div>
          <div className="mt-2 text-display font-bold tabular-nums leading-none tracking-tight text-text-primary">
            {pulse.attempts.toLocaleString()}
          </div>
          <div className="mt-3 font-pixel text-caption tabular-nums text-text-secondary">
            rolling count, resets at midnight
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Office */

type Person = {
  name: string;
  domain: string;
  presence: string | null;
  status: string;
  /** Amber for anyone who cannot actually pick this up right now. */
  tone: "green" | "amber";
};

/** Roster copy is fixed for the shoot. Theo being out today is the whole point
 * of the first assignment beat. Hardcoded for filming, no real logic. */
const ROSTER: Person[] = [
  { name: "Raj", domain: "Payments", presence: "In office", status: "Available", tone: "green" },
  { name: "Theo", domain: "Frontend", presence: null, status: "Out today", tone: "amber" },
  {
    name: "Chen",
    domain: "Payments",
    presence: "In office",
    status: "In a meeting",
    tone: "amber",
  },
  {
    name: "Jordan",
    domain: "Design systems",
    presence: "In office",
    status: "Available",
    tone: "green",
  },
  { name: "Maya", domain: "Design", presence: "In office", status: "Available", tone: "green" },
];

export function FakeOffice({
  assignedTo,
  onAssign,
}: {
  assignedTo: string | null;
  onAssign: (name: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border-hairline bg-surface px-3 py-2">
        <div className="text-label font-semibold uppercase tracking-wide text-text-secondary">
          ENGINEERING FLOOR
        </div>
        <div className="text-label text-text-secondary">
          Who is around, and who can actually pick this up.
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-canvas p-3">
        <div className="divide-y divide-border-hairline overflow-hidden rounded-lg border border-border-hairline bg-surface">
          {ROSTER.map((person) => {
            const assigned = assignedTo === person.name;
            return (
              <div key={person.name} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={person.name} />
                <div className="min-w-0 flex-1">
                  <div className="text-body font-semibold leading-snug text-text-primary">
                    {person.name}
                  </div>
                  <div className="text-label text-text-secondary">
                    {person.presence ? `${person.domain} · ${person.presence}` : person.domain}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-label font-medium leading-none ${
                    person.tone === "green"
                      ? "bg-accent-green/10 text-accent-green"
                      : "bg-status-pending/10 text-status-pending"
                  }`}
                >
                  {person.status}
                </span>
                <button
                  type="button"
                  onClick={() => onAssign(person.name)}
                  className={`shrink-0 rounded-md border px-2.5 py-1 text-label transition-colors ${
                    assigned
                      ? "border-accent-green bg-accent-green font-medium text-primary-foreground"
                      : "border-border-hairline bg-surface text-text-primary hover:bg-muted"
                  }`}
                >
                  {assigned ? "Assigned ✓" : "Assign"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Taskflow */

/** Taskflow is on the dock, so it needs a body if the actor clicks it. Static
 * board, hardcoded for filming, no real logic. */
const BOARD: { column: string; cards: string[] }[] = [
  { column: "To do", cards: ["Seller payout copy pass", "Empty-state illustration review"] },
  { column: "In progress", cards: ["Apple Pay checkout failures", "Listing assistant pilot"] },
  { column: "Done", cards: ["Search relevance tweak"] },
];

export function FakeTaskflow() {
  return (
    <div className="h-full w-full overflow-y-auto bg-canvas p-3">
      <div className="grid grid-cols-3 gap-3">
        {BOARD.map((col) => (
          <div key={col.column} className="rounded-lg border border-border-hairline bg-surface p-2">
            <div className="mb-2 px-1 text-label font-semibold uppercase tracking-wide text-text-secondary">
              {col.column}
            </div>
            <div className="flex flex-col gap-2">
              {col.cards.map((card) => (
                <div
                  key={card}
                  className="rounded-md border border-border-hairline bg-canvas px-2 py-1.5 text-label leading-snug text-text-primary"
                >
                  {card}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
