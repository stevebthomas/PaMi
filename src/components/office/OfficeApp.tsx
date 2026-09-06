"use client";

import { formatSimTime, useSimStore } from "@/store/simStore";
import { useWindowStore } from "@/store/windowStore";
import { useTaskflowStore } from "@/store/taskflowStore";
import { APP_DEFAULT_SIZE } from "@/components/desktop/Desktop";
import { availableDmContacts, dmChannelId } from "@/lib/sim/dmContacts";
import type { DmContactId } from "@/lib/sim/types";
import { ENGINEERS, type Engineer } from "@/lib/sim/worldCanon";
import { GenericAvatar } from "@/components/shared/PixelAvatar";

/** Raj's actual squad of 5 (his prompt establishes "You manage a squad of 5
 * engineers") and each engineer's established work now live in worldCanon.ts,
 * the single home for world facts, so the Office and Raj's DM persona can never
 * disagree about who is doing what. Imported and rendered here unchanged. The
 * Engineer sprites are decorative (8x8 legend, same as PixelAvatar) and
 * deliberately NOT in the AgentId/SPRITES system: none of these five have
 * dialogue or a prompt of their own, they're Office-only flavor. */

/** Jordan and Chen are the two already in payment-adjacent checkout code, so
 * they're who gets pulled when the incident needs a fix. Marcus, Ines, and
 * Theo are genuinely busy on their own work and have no reason to be pulled
 * onto a payments bug: not everyone in the company reacts to your incident. */
const INCIDENT_ENGINEER_NAMES = new Set(["Jordan", "Chen"]);

/** Small pill on every card: green when this engineer is a DM-available
 * registry contact, muted otherwise. Reads purely off the `available` flag the
 * parent derives from the registry, so it flips live with tradeoffChoice. */
function AvailabilityBadge({ available }: { available: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-caption font-medium leading-none ${
        available ? "bg-accent-green/10 text-accent-green" : "bg-muted text-text-secondary"
      }`}
    >
      {available ? "Available" : "Heads down"}
    </span>
  );
}

/**
 * A desk card. Two behaviors layered on the base card:
 * 1. Hover-to-expand (Feature 1): the base card line-clamps the task to 2
 *    lines; on hover an absolutely-positioned overlay panel shows the full,
 *    untruncated task plus a timestamp. Chose an OVERLAY over in-place growth
 *    so one card expanding never reflows the 2-col grid or stretches its
 *    row-mate. The tooltip look the app already uses (see Taskbar) and zero
 *    layout shift.
 * 2. Availability (Features 2 & 3): available cards render as a button that
 *    opens this engineer's Chattr DM; unavailable cards are a plain,
 *    non-interactive div. Both still expand on hover.
 */
function DeskCard({
  avatar,
  name,
  task,
  timestamp,
  available,
  onOpen,
  titleOverride,
}: {
  avatar: React.ReactNode;
  name: string;
  task: string;
  timestamp: string;
  available: boolean;
  onOpen?: () => void;
  /** Overrides the default "Message {name} in Chattr" / "{name} is heads
   * down" title text: used by Maya's card, whose click opens a channel
   * rather than a DM. */
  titleOverride?: string;
}) {
  return (
    <div className="group relative">
      {/* Base card: always visible, task clamped, name gets full width so it
          never truncates to the badge. */}
      <div
        role={available ? "button" : undefined}
        tabIndex={available ? 0 : undefined}
        onClick={available ? onOpen : undefined}
        onKeyDown={
          available
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen?.();
                }
              }
            : undefined
        }
        title={titleOverride ?? (available ? `Message ${name} in Chattr` : `${name} is heads down`)}
        className={`flex items-start gap-2 rounded-lg border border-border-hairline bg-surface p-2 text-label text-text-primary ${
          available ? "cursor-pointer hover:bg-muted" : "cursor-default"
        }`}
      >
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-snug">{name}</div>
          <div className="mb-1 mt-0.5">
            <AvailabilityBadge available={available} />
          </div>
          <div className="line-clamp-2 leading-snug text-text-secondary">{task}</div>
        </div>
      </div>

      {/* Hover overlay: full text + timestamp, no clamp, no reflow. */}
      <div className="pointer-events-none absolute left-0 top-0 z-30 hidden w-full group-hover:block">
        <div className="flex items-start gap-2 rounded-lg border border-border-hairline bg-surface p-2 text-label text-text-primary shadow-md">
          {avatar}
          <div className="min-w-0 flex-1">
            <div className="font-semibold leading-snug">{name}</div>
            <div className="mb-1 mt-0.5">
              <AvailabilityBadge available={available} />
            </div>
            <div className="leading-snug text-text-secondary">{task}</div>
            <div className="mt-1 font-mono text-caption tabular-nums text-text-secondary">{timestamp}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ROLLBACK_LEAD_TASK = "Rolling back payment-service to pre-payout-speed state.";
const ROLLBACK_SUPPORT_TASK = "Supporting the payment-service rollback.";
const PATCH_LEAD_TASK = "Patching retry/idempotency handling on the Apple Pay webhook.";
const PATCH_SUPPORT_TASK = "Supporting the webhook retry/idempotency patch.";

/** Engineering room: the one fully-populated room, driven entirely by real
 * game state (stateBag.tradeoffChoice) rather than hardcoded content. Every
 * engineer shows their own specific work by default. Once the incident
 * resolves (tradeoffChoice becomes non-null, whether from the player's
 * explicit rollback-vs-patch-forward call or the auto-resolve default),
 * Jordan and Chen's labels switch to the incident fix while Marcus, Ines,
 * and Theo stay exactly where they were: they were never touched by it. */
function EngineeringRoom() {
  const tradeoffChoice = useSimStore((s) => s.stateBag.tradeoffChoice);
  const tradeoffDecidedAtMinutes = useSimStore((s) => s.stateBag.tradeoffDecidedAtMinutes);
  const stateBag = useSimStore((s) => s.stateBag);
  const firedEventIds = useSimStore((s) => s.firedEventIds);
  const setActiveChannel = useSimStore((s) => s.setActiveChannel);
  const tickets = useTaskflowStore((s) => s.tickets);
  const openWindow = useWindowStore((s) => s.openWindow);
  const incidentResolved = tradeoffChoice !== null;

  // Availability comes straight from the DM registry: the SAME predicate
  // Chattr's DM list uses, so a card's badge/clickability and the DM showing
  // up in Chattr can never disagree. No name/id list maintained here.
  const availableIds = new Set(availableDmContacts({ stateBag, firedEventIds, tickets }).map((c) => c.id));

  function taskFor(engineer: Engineer): string {
    if (!incidentResolved || !INCIDENT_ENGINEER_NAMES.has(engineer.name)) return engineer.defaultTask;
    const isLead = engineer.name === "Jordan";
    if (tradeoffChoice === "rollback") return isLead ? ROLLBACK_LEAD_TASK : ROLLBACK_SUPPORT_TASK;
    return isLead ? PATCH_LEAD_TASK : PATCH_SUPPORT_TASK;
  }

  function timestampFor(engineer: Engineer): string {
    // Jordan/Chen, once actually on the fix, show when the fix was decided
    // (derived from the same tradeoffDecidedAtMinutes Pulse and their persona
    // context use). Everyone else shows when they started their listed task.
    if (incidentResolved && INCIDENT_ENGINEER_NAMES.has(engineer.name) && tradeoffDecidedAtMinutes !== null) {
      return `on this since ${formatSimTime(tradeoffDecidedAtMinutes)}`;
    }
    return `since ${formatSimTime(engineer.taskStartMinutes)}`;
  }

  function openDm(contactId: DmContactId) {
    // Chattr is normally already open, so this brings it to front and switches
    // its DM; if it isn't, it opens centered at the default size.
    openWindow(
      "chattr",
      APP_DEFAULT_SIZE.chattr,
      typeof window !== "undefined" ? window.innerWidth : 1024,
      typeof window !== "undefined" ? window.innerHeight : 640
    );
    setActiveChannel(dmChannelId(contactId));
  }

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border-hairline bg-surface px-3 py-2">
        <div className="text-label font-semibold uppercase tracking-wide text-text-secondary">ENGINEERING</div>
        <div className="text-label text-text-secondary">
          {incidentResolved
            ? "Raj's squad. Jordan and Chen pulled onto the incident fix, the rest untouched."
            : "Raj's squad of 5, each on their own work."}
        </div>
      </div>
      {/* 1-up until the room itself is wide enough for two readable cards
          (@xs = 20rem/320px), so when the office window is in its 2-column
          layout and each room is only ~220px, desk cards stack instead of
          crushing side by side. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto bg-canvas p-2 content-start @xs:grid-cols-2">
        {ENGINEERS.map((eng) => {
          // availableIds holds DmContactIds; an engineer is available only if
          // their id is one, so the cast in onOpen is sound.
          const available = availableIds.has(eng.id as DmContactId);
          return (
            <DeskCard
              key={eng.name}
              avatar={<GenericAvatar hair={eng.hair} skin={eng.skin} accent={eng.accent} />}
              name={eng.name}
              task={taskFor(eng)}
              timestamp={timestampFor(eng)}
              available={available}
              onOpen={available ? () => openDm(eng.id as DmContactId) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Maya's task blurb before her 12:30 PM design-review question fires: matches
 * the B2 standup line's framing of her work (listing wireframes). */
const MAYA_TASK_BEFORE = "Heads-down on the listing wireframes.";
/** After maya-design-question fires, she's waiting on a call on Theo's
 * save-for-later interaction (the actual content of that message). */
const MAYA_TASK_AFTER = "Wants a call on the save-for-later interaction for Theo's ticket.";
/** Sim-minute Maya started today's wireframe work: used for the "since" hover
 * timestamp before her question fires (matches the engineer taskStartMinutes
 * convention). The Office is viewable from the sim's day-start clock (510,
 * 8:30 AM: simStore's initial clockMinutes), and nothing pins Maya's morning
 * wireframe work to a specific later minute (the 9:00 AM standup line just
 * says "heads-down ... this morning"), so it reads as already-in-progress at
 * login and must be <= 510 or the hover can show a "since" time later than
 * the clock right at day start (the same class of bug fixed on Jordan/Chen/
 * Theo in worldCanon.ts's ENGINEERS). Was 540 (9:00 AM); fixed at 490
 * (8:10 AM), before login. */
const MAYA_TASK_START_MINUTES = 490; // 8:10 AM
/** The event id gating Maya's blurb switch: see day1-scenario.ts. */
const MAYA_DESIGN_QUESTION_EVENT_ID = "maya-design-question";

/**
 * Maya's Design-room card. She's a real Day 1 character (the #design-review
 * question at 12:30 PM) but is deliberately NOT in ENGINEERS (worldCanon's
 * squad of 5 is canon-locked) and NOT a DmContactId (she has no DM channel),
 * so her data lives here rather than in worldCanon, and her click action
 * opens Chattr on #design-review instead of a DM. Kept to one card: Design
 * isn't meant to look as populated as Engineering.
 */
function DesignRoom() {
  const firedEventIds = useSimStore((s) => s.firedEventIds);
  const setActiveChannel = useSimStore((s) => s.setActiveChannel);
  const openWindow = useWindowStore((s) => s.openWindow);
  const questionFired = firedEventIds.has(MAYA_DESIGN_QUESTION_EVENT_ID);

  function openDesignReview() {
    openWindow(
      "chattr",
      APP_DEFAULT_SIZE.chattr,
      typeof window !== "undefined" ? window.innerWidth : 1024,
      typeof window !== "undefined" ? window.innerHeight : 640
    );
    setActiveChannel("design-review");
  }

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border-hairline bg-surface px-3 py-2">
        <div className="text-label font-semibold uppercase tracking-wide text-text-secondary">DESIGN</div>
        <div className="text-label text-text-secondary">Maya, on the redesign.</div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto bg-canvas p-2 content-start @xs:grid-cols-2">
        <DeskCard
          avatar={<GenericAvatar hair="#3a2e28" skin="#c98a5e" accent="#c46fa1" />}
          name="Maya"
          task={questionFired ? MAYA_TASK_AFTER : MAYA_TASK_BEFORE}
          timestamp={
            questionFired
              ? `since ${formatSimTime(750)}`
              : `since ${formatSimTime(MAYA_TASK_START_MINUTES)}`
          }
          available
          onOpen={openDesignReview}
          titleOverride="Message Maya in #design-review"
        />
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

const PLACEHOLDER_ROOMS = ["SALES", "OPS / SUPPORT", "LEGAL"];

/** Visual room layout of the company. Engineering has the full squad;
 * Design has Maya's single card (she's a real Day 1 character, just not one
 * of Raj's five engineers or a DM contact). Everything else remains an
 * explicit, labeled placeholder (per spec: not populated with data/
 * interactivity, not a place to direct background engineers, not wired to
 * cost/resourcing tradeoffs). */
export function OfficeApp() {
  // @container wrapper (not the grid itself): container-query variants read the
  // nearest ANCESTOR query container, so the responsive grid must live one level
  // below the element that declares @container. This makes the room columns
  // track the OFFICE WINDOW width rather than the browser viewport. The whole
  // point of the resize work (the old `md:grid-cols-2` keyed off the viewport,
  // so a narrow office window still tried to show two columns).
  return (
    <div className="@container h-full min-h-0 w-full overflow-hidden bg-canvas">
      <div className="grid h-full min-h-0 w-full grid-cols-1 gap-2 overflow-y-auto p-2 @md:grid-cols-2">
        <div className="min-h-[300px] overflow-hidden rounded-lg border border-border-hairline">
          <EngineeringRoom />
        </div>
        <div className="min-h-[140px] overflow-hidden rounded-lg border border-border-hairline">
          <DesignRoom />
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
