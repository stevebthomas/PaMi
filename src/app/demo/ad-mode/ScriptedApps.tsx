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
 * state and never touches the store or the reply API.
 *
 * Pulse is the real dashboard's full board — same hero, same three accordions,
 * same StatTile/breakdown/bar-chart/sparkline/status-badge pieces — with
 * scripted numbers substituted for pulseMetrics' incident model (see
 * ScriptedPulse). Office and Taskflow remain APPROXIMATIONS: their real
 * components are wired to sim state the script has no equivalent for (Office
 * renders worldCanon's floor with no assign affordance; Taskflow's cards mutate
 * the taskflow store on every control), so they reuse the real components'
 * markup and class tokens but are rebuilt here with the controls inert.
 *
 * Nothing in this file calls a store action or an API.
 */

import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { Activity, BarChart3, CreditCard, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { RateSparkline } from "@/components/charts/RateSparkline";
import { WeeklyAttemptsBarChart } from "@/components/charts/WeeklyAttemptsBarChart";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ChannelListView } from "@/components/chattr/ChannelList";
import { MessageListView, type MessageListItem } from "@/components/chattr/MessageList";
import { MessageInputView } from "@/components/chattr/MessageInput";
import { GenericAvatar, PLAYER_SPRITES } from "@/components/shared/PixelAvatar";
import { ENGINEERS } from "@/lib/sim/worldCanon";
import {
  PaymentMethodBreakdownView,
  StatTile,
  checkoutStatusBadge,
  formatAttemptCount,
  toneBadge,
  toneEdge,
  toneText,
  type Tone,
} from "@/components/pulse/PulseMock";
import type { AgentId } from "@/lib/sim/types";
import {
  CHANNELS,
  DAY_END_MINUTE,
  DAY_START_MINUTE,
  DEMO_BASELINE_SUCCESS_PCT,
  DIRECT_MESSAGES,
  PULSE_COUNT_UP_MS,
  composerPlaceholder,
  derivePulse,
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

/**
 * The real Pulse dashboard, driven by the script instead of by the sim.
 *
 * Structure, markup and class tokens are PulseMock's, card for card: the hero
 * checkout SUCCESS rate (live dot, big tone-coloured figure, freshness stamp,
 * computed status badge, sparkline, "Updates live" note) over the same three
 * progressively-disclosed accordions (payment methods open by default, then the
 * checkout funnel, then traffic & support). The real pieces do the work
 * wherever they are prop-driven: `StatTile` and the `tone*` tables,
 * `PaymentMethodBreakdownView`, `WeeklyAttemptsBarChart`, `RateSparkline`,
 * `formatAttemptCount`, and `checkoutStatusBadge` — so the badge's labels,
 * icons and precedence ("Back to baseline" beats "Recovering" beats "Incident
 * active") are the shipping logic's, not a lookalike.
 *
 * What is NOT real is the data: every figure comes from `derivePulse`, the one
 * place the beat's scripted (failure rate, attempts, clock) is turned into the
 * whole board, so no two tiles on camera can disagree. The one extra card the
 * live dashboard doesn't have is the attempts/failure-rate pair directly under
 * the hero: the ad's misread beat needs "407 attempts" and "3.1%" adjacent and
 * legible in one frame.
 *
 * The one BEHAVIOUR that is the shoot's rather than the product's is the
 * count-up on those two headline figures (see `useCountUp`): a filmed recovery
 * has to read as a climb, not as four value swaps. It is a render decoration
 * only — no scene state, no recorded sample and no shipping component is
 * touched by it.
 */
/**
 * DEMO-ONLY numeric count-up. Returns a value that EASES from wherever it
 * currently sits to `target` over `durationMs`, instead of jumping.
 *
 * Why it exists: the recovery beat walks the failure rate 17 -> 12 -> 6 -> 3 on
 * a timer, and swapping four digits in place made a 60-second ad's one moment
 * of relief read as four hard cuts. Easing the digits (and only the digits)
 * turns it into a climb the eye can follow.
 *
 * What it deliberately does NOT do:
 *  - it never touches scene state, so the SCRIPTED value is still the one and
 *    only truth: each step lands as a discrete recorded sparkline sample, and
 *    the tone/badge/edge colours flip off the real `pulse` prop the instant the
 *    step fires, not off the eased digits;
 *  - it lives here, in the demo's own dashboard, and changes nothing in the
 *    shipping PulseMock;
 *  - it seeds itself with the FIRST value it is given, so a freshly mounted
 *    window paints the true number immediately rather than counting up from
 *    zero — which is what keeps the STACKING beat's first frame at 91.0%.
 *
 * Interrupting is safe: a new target mid-flight eases on from the value on
 * screen (`shownRef`), and the frame loop is cancelled on unmount, so a
 * fast-forward or an ArrowLeft mid-recovery cannot strand a running tween.
 */
function useCountUp(target: number, durationMs = PULSE_COUNT_UP_MS): number {
  const [shown, setShown] = useState(target);
  /** The value actually on screen, readable synchronously by the next tween. */
  const shownRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      // easeOutCubic: quick off the mark, settles gently onto the final digit.
      const eased = 1 - (1 - t) ** 3;
      const value = t < 1 ? from + (target - from) * eased : target;
      shownRef.current = value;
      setShown(value);
      frameRef.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [target, durationMs]);

  return shown;
}

export function ScriptedPulse({ pulse }: { pulse: PulseState }) {
  const d = derivePulse(pulse);
  // The two headline figures count; everything else (tone, badge, sparkline,
  // breakdown, funnel) reads the scripted value directly and switches at once.
  // They ease with the same curve over the same duration from complementary
  // starts, so `shownSuccess + shownFailure` is exactly 100 on every frame.
  const shownSuccessPct = useCountUp(d.successRatePct);
  const shownFailurePct = useCountUp(d.failureRatePct);

  // Same precedence the live dashboard applies (see PulseMock): red only while
  // the incident is actively degrading, green once it is back at baseline,
  // amber for the climb back. `resolutionFired` is a live-store concept with no
  // scripted equivalent, so the baseline check alone carries "resolved".
  const statusBadge = checkoutStatusBadge(d.incidentStartMinutes, d.recovering, d.isBaseline, false);
  const incidentActive = d.incidentStartMinutes !== null;
  const resolved = d.isBaseline;
  // PulseMock's own mapping: red ONLY while a declared incident is actively
  // degrading; green for healthy AND for recovering (recovery is "trending back
  // to success"); amber for a real-but-undeclared dip.
  const heroTone: Tone = incidentActive
    ? resolved || d.recovering
      ? "green"
      : "red"
    : d.isBaseline
      ? "green"
      : "amber";
  const sparklineColorVar =
    heroTone === "red" ? "--color-status-failed" : heroTone === "amber" ? "--color-status-pending" : "--color-accent-green";
  const heroDotBg =
    heroTone === "red" ? "bg-status-failed" : heroTone === "amber" ? "bg-status-pending" : "bg-accent-green";

  // The sparkline's y-range tops out at baselineRate, so hand it the scripted
  // baseline — or the best sample in the series, on the off chance a beat sits
  // above it — to keep the whole dip-and-recover hump inside the chart box.
  const sparklineBaseline = Math.max(DEMO_BASELINE_SUCCESS_PCT, ...d.successHistory.map((h) => h.rate));
  // The chart tracks the last RECORDED sample, not the tile number. They differ
  // on exactly one beat (the misread, where the tile shows 3.1% over an
  // unchanged series) and the line should keep telling the truth about the
  // series it is actually drawing.
  const lastSample = d.successHistory[d.successHistory.length - 1];

  return (
    <div className="@container h-full w-full overflow-y-auto bg-canvas p-4 text-text-primary">
      {/* Primary metric: checkout success rate leads, sparkline sits with it. */}
      <section className={cn("mb-4 rounded-[var(--radius-card)] border border-border-hairline bg-surface p-4", toneEdge[heroTone])}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-text-secondary">
              <span className="relative flex h-1.5 w-1.5">
                <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", heroDotBg)} />
                <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", heroDotBg)} />
              </span>
              Checkout success rate
            </div>
            <div className={cn("mt-2 text-5xl leading-none font-semibold tracking-tight tabular-nums", toneText[heroTone])}>
              {shownSuccessPct.toFixed(1)}%
            </div>
            <div className="mt-2 font-mono text-[11px] tabular-nums text-text-secondary">{d.freshness}</div>
          </div>
          {statusBadge && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                toneBadge[statusBadge.tone],
              )}
            >
              <statusBadge.Icon className="size-3.5" aria-hidden />
              {statusBadge.label}
            </span>
          )}
        </div>

        <div className="mt-4">
          <RateSparkline
            history={d.successHistory}
            dayStart={DAY_START_MINUTE}
            dayEnd={DAY_END_MINUTE}
            incidentStartMinutes={d.incidentStartMinutes}
            tradeoffDecidedAtMinutes={null}
            clockMinutes={lastSample.t}
            baselineRate={sparklineBaseline}
            colorVar={sparklineColorVar}
            formatTime={formatClock}
          />
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-text-secondary">
          <Activity className="size-3.5" aria-hidden />
          Updates live as the incident unfolds.
        </p>
      </section>

      {/* The ad's two confusable numbers, deliberately side by side and above
          the fold: total attempts today, and the failure rate. Beat 4 is the
          player reading the first as the second. */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatTile
          label="Checkout attempts (today)"
          value={d.attempts.toLocaleString()}
          caption="rolling count, resets at midnight"
        />
        <StatTile
          label="Checkout failure rate"
          value={`${shownFailurePct.toFixed(1)}%`}
          caption={d.freshness}
          tone={incidentActive && !resolved ? "red" : "neutral"}
        />
      </div>

      {/* Secondary data, progressively disclosed. Payment methods (the incident
          blast radius) opens by default; the rest stays one click away. */}
      <div className="rounded-[var(--radius-card)] border border-border-hairline bg-surface px-4">
        <Accordion multiple defaultValue={["payments"]}>
          <AccordionItem value="payments">
            <AccordionTrigger>
              <span className="flex items-center gap-2 text-text-primary">
                <CreditCard className="size-4 text-text-secondary" aria-hidden />
                Payment methods
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              <StatTile
                label="Failed checkouts (today)"
                value={d.failedCheckouts.toLocaleString()}
                caption={d.freshness}
                tone={incidentActive && !resolved ? "red" : "neutral"}
              />
              <PaymentMethodBreakdownView
                rows={d.methods}
                freshness={d.freshness}
                totalToday={d.attempts}
                baselineRate={DEMO_BASELINE_SUCCESS_PCT}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="funnel">
            <AccordionTrigger>
              <span className="flex items-center gap-2 text-text-primary">
                <GitBranch className="size-4 text-text-secondary" aria-hidden />
                Checkout funnel
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3">
                <StatTile label="Search → cart, today" value={`${d.searchToCartPct.toFixed(1)}%`} caption={d.freshness} />
                <StatTile
                  label="Cart → completed checkout, today"
                  value={`${d.cartToCheckoutPct.toFixed(1)}%`}
                  caption={d.freshness}
                  tone={heroTone}
                />
                <StatTile
                  label="Completed purchases today"
                  value={d.completedCheckouts.toLocaleString()}
                  caption={d.freshness}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="traffic">
            <AccordionTrigger>
              <span className="flex items-center gap-2 text-text-primary">
                <BarChart3 className="size-4 text-text-secondary" aria-hidden />
                Traffic &amp; support
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-4">
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <div className="text-[11px] text-text-secondary">Checkout attempts, last 7 days</div>
                  <div className="font-mono text-[10px] tabular-nums text-text-secondary">{d.freshness}</div>
                </div>
                <WeeklyAttemptsBarChart data={d.weekly} formatValue={formatAttemptCount} />
                <div className="mt-1 text-[10px] text-text-secondary">* today, in progress</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Avg support response" value="4h 02m" />
                <StatTile label="CSAT (7d)" value="82" />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
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
