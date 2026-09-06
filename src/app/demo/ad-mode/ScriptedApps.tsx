"use client";
/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL AD/GAME CONTENT — safe to delete after ad shoot is done.
 *
 * The four window bodies a take can show, each fed entirely from script.ts.
 *
 * Chattr is the REAL app: ChannelListView + MessageListView + MessageInputView
 * (the presentational cores of the components the live sim renders) inside
 * ChattrApp's own wrapper markup, so the sidebar, the avatar rows, the
 * composer, the fonts and the spacing are the shipping ones, not a copy. The
 * composer's send handler is the scene's own, so a scripted line lands in demo
 * state and never touches the store or the reply API. Pulse, Office and
 * Taskflow are APPROXIMATIONS:
 * their real components are wired to sim state the script has no equivalent for
 * (Pulse reports a success rate off pulseMetrics; Office renders worldCanon's
 * floor with no assign affordance; Taskflow's cards mutate the taskflow store on
 * every control). They reuse the real components' exported pieces and class
 * tokens where they can, but they are rebuilt here so a take can never write to
 * a real store.
 *
 * Nothing in this file calls a store action or an API.
 */

import { useMemo, type Ref } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { RateSparkline } from "@/components/charts/RateSparkline";
import { ChannelListView } from "@/components/chattr/ChannelList";
import { MessageListView, type MessageListItem } from "@/components/chattr/MessageList";
import { MessageInputView } from "@/components/chattr/MessageInput";
import { GenericAvatar, PLAYER_SPRITES } from "@/components/shared/PixelAvatar";
import { ENGINEERS } from "@/lib/sim/worldCanon";
import { StatTile, toneBadge, toneEdge, toneText, type Tone } from "@/components/pulse/PulseMock";
import type { AgentId } from "@/lib/sim/types";
import {
  CHANNELS,
  DAY_END_MINUTE,
  DAY_START_MINUTE,
  DIRECT_MESSAGES,
  INCIDENT_MINUTE,
  composerPlaceholder,
  formatClock,
  type ChannelId,
  type ChattrMessage,
  type PulseState,
} from "./script";

/** The player's on-camera avatar. The real sim picks this at onboarding and
 * keeps it in the store; there's no onboarding on this route, so the take uses
 * the first (default/pre-selected) option. */
export const DEMO_PLAYER_SPRITE_ID = PLAYER_SPRITES[0].id;

/* ------------------------------------------------------------------ Chattr */

/**
 * The real Chattr: ChattrApp's own layout wrapper around the real sidebar, the
 * real message thread and the real composer, with scripted messages in place of
 * store ones.
 *
 * `MessageInputView` is the shipping composer's presentational core, so the
 * textarea, the lined styling, the Send button and the Enter-sends /
 * Shift+Enter-newline semantics are the real ones. Its `onSend` is the scene's
 * scripted send (see AdModeShot): it appends to demo state only, and never
 * calls sendPlayerMessage or the reply API.
 *
 * `typingAgentId` is the real typing-indicator row. AdModeShot only passes it
 * when the channel the NPC is typing in is the one on screen, which is exactly
 * what the connected MessageList does.
 */
export function ScriptedChattr({
  activeChannel,
  unread,
  messages,
  typingAgentId,
  composer,
  onComposerChange,
  onComposerSend,
  composerRef,
  onSelectChannel,
}: {
  activeChannel: ChannelId;
  unread: ChannelId[];
  messages: ChattrMessage[];
  typingAgentId: AgentId | null;
  composer: string;
  onComposerChange: (next: string) => void;
  onComposerSend: () => void;
  composerRef: Ref<HTMLTextAreaElement>;
  onSelectChannel: (id: ChannelId) => void;
}) {
  const unreadIds = useMemo(() => new Set<string>(unread), [unread]);
  const items: MessageListItem[] = messages.map((m) => ({
    id: m.id,
    agentId: m.agentId,
    name: m.sender,
    timeLabel: m.time,
    body: m.text,
  }));

  return (
    <div className="@container flex h-full min-h-0 w-full">
      <ChannelListView
        channels={CHANNELS}
        dms={DIRECT_MESSAGES}
        activeId={activeChannel}
        unreadIds={unreadIds}
        onSelect={(id) => onSelectChannel(id as ChannelId)}
      />
      <div className="flex min-h-0 flex-1 flex-col bg-surface">
        <MessageListView
          messages={items}
          typingAgentId={typingAgentId}
          playerSpriteId={DEMO_PLAYER_SPRITE_ID}
        />
        <MessageInputView
          value={composer}
          onChange={onComposerChange}
          onSend={onComposerSend}
          placeholder={composerPlaceholder(activeChannel)}
          textareaRef={composerRef}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Pulse */

/** The failure tile goes red at or above 9%. Everything below that reads
 * neutral. Scripted threshold, no real logic. */
const FAILURE_ALARM_THRESHOLD = 9;

/**
 * APPROXIMATION of PulseMock. The real dashboard reports a checkout SUCCESS
 * rate derived from pulseMetrics' incident/tradeoff model plus three
 * progressively-disclosed accordions; the ad is built end-to-end around a
 * FAILURE rate the script drives by hand (3% -> 17% -> 6%, with one deliberate
 * misread at 3.1%). Reusing PulseMock would mean either inverting the ad's
 * central number or teaching the real component a scripted-input mode, so the
 * hero card is rebuilt here — but from the real component's own exported tone
 * tables and StatTile, and with its exact hero markup/classes.
 */
export function ScriptedPulse({ pulse }: { pulse: PulseState }) {
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

  const heroTone: Tone = alarming ? "red" : "green";
  const heroDotBg = alarming ? "bg-status-failed" : "bg-accent-green";

  return (
    <div className="@container h-full w-full overflow-y-auto bg-canvas p-4 text-text-primary">
      <section className={cn("mb-4 rounded-[var(--radius-card)] border border-border-hairline bg-surface p-4", toneEdge[heroTone])}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-text-secondary">
              <span className="relative flex h-1.5 w-1.5">
                <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", heroDotBg)} />
                <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", heroDotBg)} />
              </span>
              Checkout failure rate
            </div>
            <div className={cn("mt-2 text-5xl leading-none font-semibold tracking-tight tabular-nums", toneText[heroTone])}>
              {pulse.rate.toFixed(1)}%
            </div>
            <div className="mt-2 font-mono text-[11px] tabular-nums text-text-secondary">
              data as of {formatClock(pulse.t)}
            </div>
          </div>
          {alarming && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                toneBadge.red,
              )}
            >
              <AlertTriangle className="size-3.5" aria-hidden />
              Incident active
            </span>
          )}
        </div>

        <div className="mt-4">
          <RateSparkline
            history={pulse.history}
            dayStart={DAY_START_MINUTE}
            dayEnd={DAY_END_MINUTE}
            incidentStartMinutes={lastSample.t >= INCIDENT_MINUTE ? INCIDENT_MINUTE : null}
            tradeoffDecidedAtMinutes={null}
            clockMinutes={lastSample.t}
            baselineRate={baselineRate}
            colorVar={lineAlarming ? "--color-status-failed" : "--color-accent-green"}
            formatTime={formatClock}
          />
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-text-secondary">
          <Activity className="size-3.5" aria-hidden />
          Updates live as the incident unfolds.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3">
        <StatTile
          label="Checkout attempts (today)"
          value={pulse.attempts.toLocaleString()}
          caption="rolling count, resets at midnight"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Office */

/** Desk portraits come from the same place the real floor's do: worldCanon's
 * per-engineer palette, looked up by id so a palette change there reaches this
 * roster too. */
function palette(id: string): { hair: string; skin: string; accent: string } {
  const engineer = ENGINEERS.find((e) => e.id === id);
  if (!engineer) throw new Error(`no worldCanon palette for ${id}`);
  return { hair: engineer.hair, skin: engineer.skin, accent: engineer.accent };
}

/** Raj and Maya aren't in worldCanon's squad of five, so they carry the same
 * triples the real app already gives them elsewhere: Raj's from his PixelAvatar
 * sprite, Maya's from her desk card in OfficeApp's DesignRoom. */
const RAJ_PALETTE = { hair: "#241f33", skin: "#d8a878", accent: "#6c63ff" };
const MAYA_PALETTE = { hair: "#3a2e28", skin: "#c98a5e", accent: "#c46fa1" };

type Person = {
  name: string;
  sprite: { hair: string; skin: string; accent: string };
  /** The line the real desk card shows under the availability pill. */
  task: string;
  status: string;
  /** Amber for anyone who cannot actually pick this up right now. */
  tone: "green" | "amber";
};

/** Roster copy is fixed for the shoot. Theo being out today is the whole point
 * of the first assignment beat. Hardcoded for filming, no real logic. */
const ENGINEERING: Person[] = [
  { name: "Raj", sprite: RAJ_PALETTE, task: "Payments · running the squad.", status: "Available", tone: "green" },
  { name: "Theo", sprite: palette("theo"), task: "Frontend · nothing moving today.", status: "Out today", tone: "amber" },
  { name: "Chen", sprite: palette("chen"), task: "Payments · in the weekly platform sync.", status: "In a meeting", tone: "amber" },
  { name: "Jordan", sprite: palette("jordan"), task: "Design systems · component library pass.", status: "Available", tone: "green" },
];

const DESIGN: Person[] = [
  { name: "Maya", sprite: MAYA_PALETTE, task: "Heads-down on the listing wireframes.", status: "Available", tone: "green" },
];

const PLACEHOLDER_ROOMS = ["SALES", "OPS / SUPPORT", "LEGAL"];

/** Real OfficeApp's AvailabilityBadge treatment, widened to the ad's third
 * (amber) state. */
function StatusPill({ label, tone }: { label: string; tone: "green" | "amber" }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-caption font-medium leading-none ${
        tone === "green" ? "bg-accent-green/10 text-accent-green" : "bg-status-pending/10 text-status-pending"
      }`}
    >
      {label}
    </span>
  );
}

/** Real OfficeApp's DeskCard, plus the Assign control the ad needs. */
function DeskCard({
  person,
  assigned,
  onAssign,
}: {
  person: Person;
  assigned: boolean;
  onAssign: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border-hairline bg-surface p-2 text-label text-text-primary">
      <GenericAvatar {...person.sprite} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold leading-snug">{person.name}</div>
        <div className="mb-1 mt-0.5">
          <StatusPill label={person.status} tone={person.tone} />
        </div>
        <div className="line-clamp-2 leading-snug text-text-secondary">{person.task}</div>
        <button
          type="button"
          onClick={onAssign}
          className={`mt-1.5 rounded-md border px-2 py-0.5 text-label transition-colors ${
            assigned
              ? "border-accent-green bg-accent-green font-medium text-primary-foreground"
              : "border-border-hairline bg-surface text-text-primary hover:bg-muted"
          }`}
        >
          {assigned ? "Assigned ✓" : "Assign"}
        </button>
      </div>
    </div>
  );
}

/** Real OfficeApp's room shell (header strip + desk-card grid). */
function Room({
  label,
  blurb,
  people,
  assignedTo,
  onAssign,
}: {
  label: string;
  blurb: string;
  people: Person[];
  assignedTo: string | null;
  onAssign: (name: string) => void;
}) {
  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border-hairline bg-surface px-3 py-2">
        <div className="text-label font-semibold uppercase tracking-wide text-text-secondary">{label}</div>
        <div className="text-label text-text-secondary">{blurb}</div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto bg-canvas p-2 content-start @xs:grid-cols-2">
        {people.map((person) => (
          <DeskCard
            key={person.name}
            person={person}
            assigned={assignedTo === person.name}
            onAssign={() => onAssign(person.name)}
          />
        ))}
      </div>
    </div>
  );
}

function PlaceholderRoom({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 bg-canvas p-4 text-center">
      <div className="text-label font-semibold uppercase tracking-wide text-text-secondary">{label}</div>
      <div className="rounded-lg border border-border-hairline bg-surface px-3 py-1.5 text-label text-text-secondary">
        Work in progress
      </div>
    </div>
  );
}

/**
 * APPROXIMATION of OfficeApp. The real floor renders worldCanon's five-engineer
 * squad off store predicates and has NO assign affordance at all — clicking a
 * desk opens that person's DM. The ad's central beat is assigning the incident
 * to someone, twice, so the room layout, the room shells, the desk cards and
 * every class token here are the real component's, but the roster, the third
 * (amber) availability state and the Assign button are the shoot's.
 */
export function ScriptedOffice({
  assignedTo,
  onAssign,
}: {
  assignedTo: string | null;
  onAssign: (name: string) => void;
}) {
  return (
    <div className="@container h-full min-h-0 w-full overflow-hidden bg-canvas">
      <div className="grid h-full min-h-0 w-full grid-cols-1 gap-2 overflow-y-auto p-2 @md:grid-cols-2">
        <div className="min-h-[300px] overflow-hidden rounded-lg border border-border-hairline">
          <Room
            label="ENGINEERING"
            blurb="Who is around, and who can actually pick this up."
            people={ENGINEERING}
            assignedTo={assignedTo}
            onAssign={onAssign}
          />
        </div>
        <div className="min-h-[140px] overflow-hidden rounded-lg border border-border-hairline">
          <Room
            label="DESIGN"
            blurb="Maya, on the redesign."
            people={DESIGN}
            assignedTo={assignedTo}
            onAssign={onAssign}
          />
        </div>
        {PLACEHOLDER_ROOMS.map((label) => (
          <div key={label} className="min-h-[140px] overflow-hidden rounded-lg border border-border-hairline">
            <PlaceholderRoom label={label} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Taskflow */

type ScriptedTicket = {
  displayId: string;
  title: string;
  description?: string;
  reporter?: string;
  time: string;
  assignee: string | null;
  /** Story tickets carry the amber left edge, same as the real board. */
  story?: boolean;
};

/** Taskflow is on the dock, so it needs a body if the actor clicks it. Static
 * board, hardcoded for filming, no real logic. */
const BOARD: { label: string; tickets: ScriptedTicket[] }[] = [
  {
    label: "TO DO",
    tickets: [
      {
        displayId: "TF-4",
        title: "Seller payout copy pass",
        description: "Rewrite the payout timing copy on the seller dashboard.",
        reporter: "Derek",
        time: "8:40 AM",
        assignee: null,
      },
      {
        displayId: "TF-5",
        title: "Empty-state illustration review",
        description: "Sign off on Maya's new empty state.",
        reporter: "Maya",
        time: "8:58 AM",
        assignee: "Maya",
      },
    ],
  },
  {
    label: "IN PROGRESS",
    tickets: [
      {
        displayId: "TF-1",
        title: "Apple Pay checkout failures",
        description: "Failed checkouts climbing on the Apple Pay webhook.",
        reporter: "Priya",
        time: "9:14 AM",
        assignee: "Raj",
        story: true,
      },
      {
        displayId: "TF-2",
        title: "Listing assistant pilot",
        description: "Eval batch before we scope the rollout.",
        reporter: "Derek",
        time: "9:03 AM",
        assignee: "You",
      },
    ],
  },
  {
    label: "DONE",
    tickets: [
      {
        displayId: "TF-3",
        title: "Search relevance tweak",
        reporter: "Raj",
        time: "8:15 AM",
        assignee: "Jordan",
      },
    ],
  },
];

/** Real TaskflowApp's TicketCard markup, minus every control that writes to a
 * store (the move arrows and the assignee picker are rendered in their resting
 * state and do nothing). */
function TicketCard({ ticket }: { ticket: ScriptedTicket }) {
  return (
    <div
      className={`mb-2 rounded-lg border border-border-hairline bg-surface p-2 text-label text-text-primary ${
        ticket.story ? "border-l-2 border-l-status-pending" : ""
      }`}
    >
      <div className="mb-0.5 font-mono text-[10px] text-text-secondary">{ticket.displayId}</div>
      <div className="mb-1 break-words font-semibold leading-snug">{ticket.title}</div>
      {ticket.description && (
        <div className="mb-1 hidden leading-snug text-text-secondary @[12rem]:block">{ticket.description}</div>
      )}
      {ticket.reporter && <div className="mb-2 text-label text-text-secondary">Reported by {ticket.reporter}</div>}
      <div className="flex flex-wrap items-center gap-1">
        <span className="hidden shrink-0 font-mono text-label tabular-nums text-text-secondary @[12rem]:inline">
          {ticket.time}
        </span>
        <div className="flex flex-1 items-center justify-end gap-1 @[12rem]:min-w-0">
          <div className="flex-1 @[12rem]:min-w-0">
            <div className="relative flex justify-end @[12rem]:min-w-0">
              <span
                className={`hidden w-full min-w-[3.5rem] truncate rounded-full px-2 py-0.5 text-left text-label @[12rem]:block ${
                  ticket.assignee
                    ? "bg-muted text-text-primary"
                    : "border border-border-hairline bg-transparent text-text-secondary"
                }`}
              >
                {ticket.assignee ?? "Unassigned"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * APPROXIMATION of TaskflowApp. Every control on a real ticket card writes
 * straight to the taskflow store (move, assign, and one card that advances the
 * sim clock), which this route must never do, so the board is rebuilt from the
 * real component's markup and class tokens with the controls inert. No beat
 * puts Taskflow on camera; it exists so the dock tile opens something real.
 */
export function ScriptedTaskflow() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border-hairline bg-surface p-2">
        <input
          readOnly
          value=""
          placeholder="New ticket title…"
          className="rounded-md border border-border-hairline bg-surface px-2 py-1 text-label text-text-primary outline-none"
        />
        <div className="flex gap-2">
          <input
            readOnly
            value=""
            placeholder="Short description (optional)…"
            className="flex-1 rounded-md border border-border-hairline bg-surface px-2 py-1 text-label text-text-primary outline-none"
          />
          <button
            disabled
            className="rounded-md bg-primary px-3 py-1 text-label font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Add
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto bg-canvas p-2">
        {BOARD.map((col) => (
          <div key={col.label} className="@container flex min-h-0 min-w-0 flex-col">
            <div className="mb-2 text-label font-semibold uppercase tracking-wide text-text-secondary">
              {col.label} (<span className="tabular-nums">{col.tickets.length}</span>)
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
              {col.tickets.map((t) => (
                <TicketCard key={t.displayId} ticket={t} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
