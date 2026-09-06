/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL AD/GAME CONTENT — safe to delete after ad shoot is done.
 *
 * The whole ~60 second ad, as data. Every clock reading, every message, every
 * Pulse number and every banner below is HARDCODED FOR FILMING: there is no
 * simulation, no scoring and no real logic anywhere in this folder. The route
 * RENDERS the real app's components (dock, status bar, Chattr sidebar/thread/
 * composer, pixel avatars) so a take is pixel-identical to the live sim, but it
 * only ever feeds them props from this file: it never writes to a store and
 * never calls an API, so it can be deleted wholesale after the shoot.
 *
 * The engine (AdModeShot.tsx) walks SCRIPT one step at a time on ArrowLeft.
 * Each step gets a pure `apply` patch over SceneState, an optional notification
 * banner, an optional `exchange` (the sequenced typing timeline — see below),
 * optional `autos` (scripted sub-events fired on a timer once the step becomes
 * active) and an optional `onAssign` reaction for the Office beat the actor
 * drives by hand on camera.
 *
 * EXCHANGES. A beat that puts words on screen does NOT append them in its
 * `apply` patch. It declares them as an ordered `exchange`, and the engine
 * plays that list as one cancellable async timeline:
 *
 *   player line -> characters appear one at a time in the REAL composer, then
 *                  the real Enter/send path fires and the message lands
 *   npc line    -> the REAL typing indicator holds in the target channel (only
 *                  visible if that channel is the one on screen, exactly like
 *                  the live app), then the indicator clears and the message
 *                  lands in the SAME state update
 *
 * A banner attached to an exchange line fires the moment that line LANDS, not
 * at beat entry. A banner attached to the step (or to an `auto`) is not tied to
 * a message and keeps its original beat-entry / timer timing.
 *
 * Pacing is data, not code: PLAYER_TYPING and NPC_TYPING below are the global
 * knobs, and any single line can override them (`typing` on a player line,
 * `indicatorMs` on an NPC line) without touching the engine.
 */

/* ------------------------------------------------------------------ types */

import type { AgentId } from "@/lib/sim/types";

/** The four apps with scripted content. Every other dock tile is present (the
 * real dock is rendered in full) but inert during a take. */
export type FrontApp = "chattr" | "pulse" | "taskflow" | "office";
export type Overlay = "none" | "scorecard" | "day2" | "eval";

export type ChannelId =
  | "general"
  | "incidents"
  | "design-review"
  | "random"
  | "dm-raj"
  | "dm-priya"
  | "dm-derek"
  | "dm-marcus";

export type ChattrMessage = {
  id: string;
  /** Resolves the real PixelAvatar sprite for this line. */
  agentId: AgentId;
  sender: string;
  time: string;
  text: string;
  /** Thread history: this line was already on screen before the take started,
   * so it renders instantly and never runs through the typing engine. Only
   * INITIAL_SCENE seeds carry it. */
  history?: true;
};

export type BannerSpec = { agentId: AgentId; sender: string; preview: string };

/** Who the REAL typing indicator is showing for, and in which channel. The
 * engine only hands it to MessageListView when that channel is the one on
 * screen, so switching away mid-hold hides it exactly like the live app. */
export type TypingIndicator = { channel: ChannelId; agentId: AgentId };

export type SceneState = {
  /** Day number shown in the status bar clock. Jumps to 2 at the closer. */
  day: number;
  /** Sim minute the status bar clock reads. Jumps discretely between steps,
   * and also drives the battery meter and the wallpaper's ambient tint, the
   * same two things the real clock drives. */
  minutes: number;
  /**
   * The OPEN WINDOW SET for this beat, in open order. The engine places each
   * one through the real product's `cascadePlacement`, so several windows
   * spread across the desk with exactly the stagger the live app gives them;
   * apps that drop out of this list have their window closed. Order is the
   * OPEN order (it decides the cascade step a newly-opened window gets), NOT
   * the stacking order — `frontApp` owns that.
   */
  windows: FrontApp[];
  /** The focused window: raised to the top of the stack and, for Chattr, the
   * one the scripted composer types into. Always a member of `windows`. */
  frontApp: FrontApp;
  overlay: Overlay;
  activeChannel: ChannelId;
  /** Channel ids drawn with the unread ring + dot + bold treatment. */
  unread: ChannelId[];
  /** Number on the Chattr dock badge. Scripted, never counted. */
  chattrBadge: number;
  messages: Record<ChannelId, ChattrMessage[]>;
  pulse: PulseState;
  /** Name of the engineer the actor assigned in Office, or null. */
  assignedTo: string | null;
  /** Text currently in the real composer. Driven character-by-character by a
   * scripted player line; cleared by the real send path. */
  composer: string;
  /** Active NPC typing indicator, or null. */
  typing: TypingIndicator | null;
};

/**
 * The ONLY scripted Pulse inputs. Everything the dashboard shows — the hero
 * success rate, the failed-checkout count, the per-payment-method rows, the
 * funnel tiles, the weekly bar chart's live Monday bar, the status badge — is
 * DERIVED from these three numbers by `derivePulse` below, in one place. No
 * beat sets a second, independently-authored figure, so no two tiles on screen
 * can ever disagree.
 */
export type PulseState = {
  /** Checkout FAILURE rate, in percent (the ad is written around it: 3 -> 17
   * -> 6 -> 3, with one deliberate 3.1 misread). The dashboard displays its
   * complement, the success rate, like the real Pulse does. */
  rate: number;
  /** Checkout attempts today. Scripted value, not derived. */
  attempts: number;
  /** Sim minute the tiles claim to be showing: drives the sparkline "now" dot
   * and the "data as of" freshness stamp. */
  t: number;
  /** Sparkline series, as FAILURE rates (same orientation as `rate`).
   * Scripted samples only, no real data behind it. */
  history: { t: number; rate: number }[];
};

export type StatePatch = (s: SceneState) => SceneState;

/* ------------------------------------------------------ typing/pacing config */

/**
 * Player typing cadence, in milliseconds. Retune the ad's on-camera typing
 * speed here; no engine change is needed.
 *
 *  perCharMinMs/perCharMaxMs  per-character delay, drawn uniformly at random
 *                             per character so the rhythm reads human rather
 *                             than metronomic
 *  punctuationPauseMs         added AFTER any PUNCTUATION character, the little
 *                             beat a person takes at a comma or a full stop
 *  sendPauseMs                the pause between the last character and the
 *                             Enter keypress
 */
export const PLAYER_TYPING = {
  perCharMinMs: 30,
  perCharMaxMs: 70,
  punctuationPauseMs: 250,
  sendPauseMs: 420,
};

export type PlayerTypingConfig = typeof PLAYER_TYPING;

/** Per-line override for a scripted player message. Every field is optional and
 * falls back to PLAYER_TYPING. */
export type PlayerTypingOverride = Partial<PlayerTypingConfig>;

/** Characters that earn the extra `punctuationPauseMs` beat. */
export const PUNCTUATION = /[.,!?;:]/;

/**
 * NPC typing-indicator hold, in milliseconds:
 *
 *   clamp((baseMs + perCharMs * messageLength) * (1 ± jitterRatio), minMs, maxMs)
 *
 * Long messages hold longer, so a two-line correction from Priya reads as
 * genuinely being composed, while the clamp stops a paragraph from stalling a
 * take. Any single NPC line can bypass the whole formula with `indicatorMs`.
 */
export const NPC_TYPING = {
  baseMs: 600,
  perCharMs: 18,
  /** ±20% random wobble applied before the clamp. */
  jitterRatio: 0.2,
  minMs: 900,
  maxMs: 3800,
};

export type NpcTypingConfig = typeof NPC_TYPING;

/** Delay before the next character of a scripted player line. */
export function playerCharDelayMs(char: string, cfg: PlayerTypingConfig = PLAYER_TYPING): number {
  const span = Math.max(0, cfg.perCharMaxMs - cfg.perCharMinMs);
  const base = cfg.perCharMinMs + Math.random() * span;
  return Math.round(base + (PUNCTUATION.test(char) ? cfg.punctuationPauseMs : 0));
}

/** How long the real typing indicator holds before an NPC line lands. */
export function npcIndicatorMs(length: number, cfg: NpcTypingConfig = NPC_TYPING): number {
  const base = cfg.baseMs + cfg.perCharMs * length;
  const jitter = 1 + (Math.random() * 2 - 1) * cfg.jitterRatio;
  return Math.round(Math.min(cfg.maxMs, Math.max(cfg.minMs, base * jitter)));
}

/* --------------------------------------------------------------- exchanges */

/** A message the PLAYER types, character by character, through the real
 * composer, and then sends through the real Enter/send path. */
export type PlayerLine = {
  kind: "player";
  /** Which thread the line is typed into. The beat's `apply` is responsible for
   * putting that channel on screen first. */
  channel: ChannelId;
  time: string;
  text: string;
  /** Per-line cadence override. */
  typing?: PlayerTypingOverride;
  /** Extra patch folded into the same update the sent message lands in. */
  apply?: StatePatch;
  /** Banner fired the moment the message lands. */
  banner?: BannerSpec;
};

/** A message an NPC sends: real typing indicator first, then the line. */
export type NpcLine = {
  kind: "npc";
  channel: ChannelId;
  agentId: AgentId;
  sender: string;
  time: string;
  text: string;
  /** Hard override of the computed indicator hold, in ms. Skips the formula. */
  indicatorMs?: number;
  /** Extra patch folded into the SAME update the message lands in (unread
   * marking, badge counts), so the indicator can never be on screen next to
   * the message it was announcing. */
  apply?: StatePatch;
  /** Banner fired the moment the message lands, after the indicator. */
  banner?: BannerSpec;
};

export type ExchangeEvent = PlayerLine | NpcLine;

/** The sender identity every scripted player line carries. */
export const PLAYER_AGENT_ID: AgentId = "player";
export const PLAYER_SENDER = "You";

export type AutoEvent = {
  delayMs: number;
  apply?: StatePatch;
  /** Not tied to a scripted message: fires on this timer, as before. */
  banner?: BannerSpec;
  /** Sequenced exchange kicked off at `delayMs`, played through the same
   * indicator/typing engine as a step-level exchange. */
  exchange?: ExchangeEvent[];
};

export type AssignReaction = {
  /** Only this engineer triggers the reaction. Anyone else gets silence. */
  person: string;
  delayMs: number;
  apply?: StatePatch;
  banner?: BannerSpec;
  exchange?: ExchangeEvent[];
};

export type Step = {
  id: string;
  /** Operator-facing label in the tiny filming HUD. Never part of the ad. */
  label: string;
  apply: StatePatch;
  /** Step-level banner: NOT tied to a scripted message, so it still fires at
   * beat entry. Message-tied banners live on the exchange line instead. */
  banner?: BannerSpec;
  exchange?: ExchangeEvent[];
  autos?: AutoEvent[];
  onAssign?: AssignReaction;
};

/* ------------------------------------------------------- channel registry */

export const CHANNELS: { id: ChannelId; label: string }[] = [
  { id: "general", label: "#general" },
  { id: "incidents", label: "#incidents" },
  { id: "design-review", label: "#design-review" },
  { id: "random", label: "#random" },
];

/**
 * The DM sidebar, mirroring what the REAL ChannelList would derive at this
 * point in the day. The live list is the three static CHANNELS DMs (Raj,
 * Priya, Derek) plus every DM_CONTACTS registry entry whose `availableWhen`
 * predicate is currently true. Mid-morning, with no fix path chosen yet,
 * that's Marcus alone: Jordan and Chen only appear once `tradeoffChoice` is
 * set, and Maya is not a DM contact at all (her thread is #design-review).
 */
export const DIRECT_MESSAGES: { id: ChannelId; label: string }[] = [
  { id: "dm-raj", label: "Raj" },
  { id: "dm-priya", label: "Priya" },
  { id: "dm-derek", label: "Derek" },
  { id: "dm-marcus", label: "Marcus" },
];

/** The composer placeholder, resolved the way the real MessageInput resolves
 * it: static channel label first, then the DM contact's name. */
export function composerPlaceholder(channel: ChannelId): string {
  const label =
    CHANNELS.find((c) => c.id === channel)?.label ??
    DIRECT_MESSAGES.find((d) => d.id === channel)?.label ??
    channel;
  return `Message ${label}…`;
}

/* ------------------------------------------------------------- time utils */

/** 580 -> "9:40 AM". Local copy so this folder stays free of lib imports. */
export function formatClock(totalMinutes: number): string {
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = ((totalMinutes % 60) + 60) % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** Sim minute the incident is scripted to start (9:15 AM), for the sparkline
 * marker only. Hardcoded for filming, no real logic. */
export const INCIDENT_MINUTE = 555;

/** Day window the shoot runs in (8:30 AM - 6:00 PM), mirroring the real Day 1
 * bounds. Only used to scale the sparkline's x-axis, the battery meter and the
 * ambient tint; nothing reads the real scenario tables. */
export const DAY_START_MINUTE = 510;
export const DAY_END_MINUTE = 1080;

/** "Day 1 · 9:40 AM" for the status bar, matching the real StatusBar's own
 * `Day {day} · {formatSimTime(clockMinutes)}` readout. */
export function clockLabel(s: SceneState): string {
  return `Day ${s.day} · ${formatClock(s.minutes)}`;
}

/** 0 at day start, 1 at day end. Feeds the real battery meter and the
 * wallpaper tint exactly like getDayProgress does in the live sim. */
export function dayProgress(s: SceneState): number {
  const raw = (s.minutes - DAY_START_MINUTE) / (DAY_END_MINUTE - DAY_START_MINUTE);
  return Math.max(0, Math.min(1, raw));
}

/* ------------------------------------------------- derived Pulse numbers */

/**
 * The scripted world's healthy checkout success rate, and its complement. The
 * live sim's canon baseline is 99.7% (worldCanon.BASELINE_RATE); the ad runs a
 * deliberately louder world so a 60-second shot reads on camera, so the shoot
 * declares its own band here rather than pretending to be canon.
 */
export const DEMO_BASELINE_SUCCESS_PCT = 97;
export const DEMO_BASELINE_FAILURE_PCT = 100 - DEMO_BASELINE_SUCCESS_PCT;

/** Failure rate at which the scripted incident counts as DECLARED (the point
 * the badge turns red and the sparkline goes to status colour). */
export const DEMO_ALARM_FAILURE_PCT = 9;

/**
 * Share of checkout attempts per payment method. Mirrors the live model's split
 * (worldCanon.APPLE_PAY_SHARE = 0.35, pulseMetrics' GOOGLE_PAY_SHARE = 0.17,
 * card = the rest) so the breakdown rows carry the same weights the real
 * dashboard does. Copied rather than imported: this folder is deleted wholesale
 * after the shoot and must not become a live dependency of the sim's canon.
 */
const APPLE_PAY_SHARE = 0.35;
const GOOGLE_PAY_SHARE = 0.17;
const CARD_SHARE = 1 - APPLE_PAY_SHARE - GOOGLE_PAY_SHARE;

/** Funnel conversions, mirroring worldCanon's SEARCH_TO_CART_RATE (0.12) and
 * CART_TO_CHECKOUT_START_RATE (0.65). Search -> cart sits upstream of the
 * Apple Pay webhook so it holds flat; cart -> completed checkout folds in the
 * live success rate, exactly like cartToCompletedCheckoutRateAt does. */
const SEARCH_TO_CART_PCT = 12;
const CART_TO_CHECKOUT_START_RATE = 0.65;

/** Freshness-stamp granularity, mirroring pulseMetrics.SAMPLE_STEP_MINUTES: a
 * dashboard refreshes on a cadence, so "data as of" floors to 5 sim-minutes. */
const SAMPLE_STEP_MINUTES = 5;

/** Fixed checkout-attempt counts for the six complete days ending yesterday.
 * The relative weekday/weekend SHAPE is the live chart's own
 * (pulseMetrics' BASE_WEEKLY_SHAPE); the magnitude is left at that shape's
 * scale because it sits naturally alongside the ad's few-hundred-per-day live
 * counter. Static, hardcoded for filming. */
const DEMO_WEEKLY_ATTEMPTS: { label: string; value: number }[] = [
  { label: "Tue", value: 1180 },
  { label: "Wed", value: 1240 },
  { label: "Thu", value: 1310 },
  { label: "Fri", value: 1460 },
  { label: "Sat", value: 890 },
  { label: "Sun", value: 760 },
];

export type PulseMethodRow = { method: string; share: number; successRate: number };

/** Everything the scripted dashboard renders, all of it a function of ONE
 * PulseState. */
export type DerivedPulse = {
  /** Hero figure: 100 − failure rate. */
  successRatePct: number;
  failureRatePct: number;
  attempts: number;
  /** attempts x failure rate. */
  failedCheckouts: number;
  /** attempts − failedCheckouts, so the two always sum back to attempts. */
  completedCheckouts: number;
  /** Apple Pay carries the damage; card and Google Pay hold at baseline. The
   * share-weighted blend of these rows equals `successRatePct` exactly. */
  methods: PulseMethodRow[];
  /** Static history plus today's partial (= attempts) as the muted final bar. */
  weekly: { label: string; value: number; muted?: boolean }[];
  searchToCartPct: number;
  cartToCheckoutPct: number;
  /** "data as of 11:20 AM", floored to the refresh cadence. */
  freshness: string;
  /** Sparkline series, flipped to the success-rate orientation the real hero
   * sparkline uses: the incident is a DIP that recovers, not a spike. */
  successHistory: { t: number; rate: number }[];
  /** Status inputs, in the exact shape the real `checkoutStatusBadge` takes. */
  incidentStartMinutes: number | null;
  recovering: boolean;
  isBaseline: boolean;
};

/**
 * The SINGLE derivation. Given a beat's scripted (failure rate, attempts, t,
 * history), produce every number the dashboard shows.
 *
 * Apple Pay's rate is solved, not invented: with card/Google Pay pinned at
 * baseline, the share-weighted blend must equal the scripted overall rate, so
 *
 *   applePay = baseline − (failureRate − baselineFailure) / applePayShare
 *
 * which is why a 17% overall failure spike drives Apple Pay to 57% while the
 * other rails sit at 97% — the same "all Apple Pay" shape the live breakdown
 * has, at the ad's louder scale.
 *
 * Incident phase comes from the RECORDED series, not the tile number, so the
 * misread beat (`record: false`: 3.1% on the tile over an unchanged 17% series)
 * still reads as a live incident rather than briefly declaring itself resolved.
 */
export function derivePulse(pulse: PulseState): DerivedPulse {
  const failureRatePct = pulse.rate;
  const successRatePct = 100 - failureRatePct;
  const attempts = pulse.attempts;
  const failedCheckouts = Math.round((attempts * failureRatePct) / 100);

  const applePayRate =
    DEMO_BASELINE_SUCCESS_PCT - (failureRatePct - DEMO_BASELINE_FAILURE_PCT) / APPLE_PAY_SHARE;

  const recordedRates = pulse.history.map((h) => h.rate);
  const peakFailure = Math.max(...recordedRates);
  const latestFailure = recordedRates[recordedRates.length - 1];
  // Declared once the series has actually been to alarm level; from then on the
  // incident stays declared for the rest of the take, exactly like the real
  // dashboard's escalation gate.
  const declared = peakFailure >= DEMO_ALARM_FAILURE_PCT;
  const isBaseline = failureRatePct <= DEMO_BASELINE_FAILURE_PCT;
  const recovering = declared && !isBaseline && latestFailure < peakFailure;

  return {
    successRatePct,
    failureRatePct,
    attempts,
    failedCheckouts,
    completedCheckouts: attempts - failedCheckouts,
    methods: [
      { method: "Apple Pay", share: APPLE_PAY_SHARE, successRate: Math.max(0, applePayRate) },
      { method: "Card", share: CARD_SHARE, successRate: DEMO_BASELINE_SUCCESS_PCT },
      { method: "Google Pay", share: GOOGLE_PAY_SHARE, successRate: DEMO_BASELINE_SUCCESS_PCT },
    ],
    weekly: [...DEMO_WEEKLY_ATTEMPTS, { label: "Mon*", value: attempts, muted: true }],
    searchToCartPct: SEARCH_TO_CART_PCT,
    cartToCheckoutPct: CART_TO_CHECKOUT_START_RATE * successRatePct,
    freshness: `data as of ${formatClock(
      Math.floor(pulse.t / SAMPLE_STEP_MINUTES) * SAMPLE_STEP_MINUTES,
    )}`,
    successHistory: pulse.history.map((h) => ({ t: h.t, rate: 100 - h.rate })),
    incidentStartMinutes: declared ? INCIDENT_MINUTE : null,
    recovering,
    isBaseline,
  };
}

/* --------------------------------------------------------- patch builders */

/** Appends one message to a channel. Pure, so re-invoking the state updater
 * (React strict mode does) can never double-post. */
function say(
  s: SceneState,
  channel: ChannelId,
  agentId: AgentId,
  sender: string,
  time: string,
  text: string,
): SceneState {
  const existing = s.messages[channel];
  return {
    ...s,
    messages: {
      ...s.messages,
      [channel]: [...existing, { id: `${channel}-${existing.length}`, agentId, sender, time, text }],
    },
  };
}

/** The engine's entry point into `say`: lands one exchange line in its channel.
 * Pure, so it composes with an event's own `apply` inside one state update. */
export function landLine(s: SceneState, line: ExchangeEvent): SceneState {
  const landed =
    line.kind === "player"
      ? say(s, line.channel, PLAYER_AGENT_ID, PLAYER_SENDER, line.time, line.text)
      : say(s, line.channel, line.agentId, line.sender, line.time, line.text);
  return line.apply ? line.apply(landed) : landed;
}

/**
 * Stages the beat's desktop: the ordered OPEN WINDOW SET plus which of them is
 * focused (defaults to the last entry, so `show(s, ["chattr", "pulse"])` reads
 * as "Pulse in front, Chattr staggered behind it"). Windows already open keep
 * the position they were placed at — and any position the actor dragged them
 * to; windows that drop out of the list are closed. The last entry is the one
 * that gets the newest cascade step, so declaring a scene's BACKGROUND window
 * first is what makes the front one land offset on top of it.
 */
function show(s: SceneState, windows: FrontApp[], front?: FrontApp): SceneState {
  return { ...s, windows, frontApp: front ?? windows[windows.length - 1] };
}

function markUnread(s: SceneState, ...ids: ChannelId[]): SceneState {
  return { ...s, unread: Array.from(new Set([...s.unread, ...ids])) };
}

/** Opening a channel clears its unread treatment. */
function read(s: SceneState, channel: ChannelId): SceneState {
  return { ...s, activeChannel: channel, unread: s.unread.filter((id) => id !== channel) };
}

/**
 * Sets the two Pulse numbers. `record: false` shows a value on the tile WITHOUT
 * appending it to the sparkline series: used once, at the misread beat, where
 * the script deliberately puts 3.1% next to 407 attempts. Folding that reading
 * into the series would turn the recovery hump into a spike/dip/spike and lose
 * the shape the closer is built around. Scripted values, no real data.
 */
function setPulse(
  s: SceneState,
  t: number,
  rate: number,
  attempts: number,
  record = true,
): SceneState {
  return {
    ...s,
    pulse: {
      t,
      rate,
      attempts,
      history: record ? [...s.pulse.history, { t, rate }] : s.pulse.history,
    },
  };
}

/* ------------------------------------------------------------ beat 0 state */

export const INITIAL_SCENE: SceneState = {
  day: 1,
  minutes: 540, // 9:00 AM
  // The calm open: Chattr alone, centered, exactly like the real desktop's
  // first window at login.
  windows: ["chattr"],
  frontApp: "chattr",
  overlay: "none",
  activeChannel: "design-review",
  unread: [],
  chattrBadge: 0,
  composer: "",
  typing: null,
  // Every seed below is `history`: it was already in the thread when the take
  // started, so it paints instantly on beat 0 (and on reset) and never runs
  // through the typing engine.
  messages: {
    general: [
      {
        id: "general-0",
        agentId: "raj",
        sender: "Raj",
        time: "8:47 AM",
        text: "morning all. standup in 10.",
        history: true,
      },
    ],
    incidents: [],
    "design-review": [
      {
        id: "design-review-0",
        agentId: "maya",
        sender: "Maya",
        time: "8:58 AM",
        text: "pushed the new empty-state illustration, lmk what you think 👀",
        history: true,
      },
    ],
    random: [
      {
        id: "random-0",
        agentId: "derek",
        sender: "Derek",
        time: "8:31 AM",
        text: "whoever left the good coffee in the kitchen, thank you",
        history: true,
      },
    ],
    "dm-raj": [],
    "dm-priya": [],
    "dm-derek": [],
    "dm-marcus": [],
  },
  // Scripted Pulse values. Two samples so the sparkline has a line to draw at
  // the very first frame. Hardcoded for filming, no real logic.
  pulse: {
    rate: 3,
    attempts: 268,
    t: 540,
    history: [
      { t: 510, rate: 2.6 },
      { t: 540, rate: 3 },
    ],
  },
  assignedTo: null,
};

/* ----------------------------------------------------------------- SCRIPT */

export const SCRIPT: Step[] = [
  /* 0 */
  {
    id: "calm",
    label: "CALM",
    // Step 0 is the initial scene, so its patch is the identity: pressing R
    // rebuilds INITIAL_SCENE and re-enters this step. Its thread content is
    // history (see INITIAL_SCENE) and paints instantly.
    apply: (s) => s,
  },

  /* 1 */
  {
    id: "first-fire",
    label: "FIRST FIRE",
    // Opens #incidents empty, then Priya types into it on camera. Still Chattr
    // alone: the desk is calm right up to the moment it isn't.
    apply: (s) => read(show({ ...s, day: 1, minutes: 555 }, ["chattr"]), "incidents"),
    exchange: [
      {
        kind: "npc",
        channel: "incidents",
        agentId: "priya",
        sender: "Priya",
        time: "9:14 AM",
        text: "Heads up. Seeing a spike in failed checkouts on Apple Pay. Volume's climbing fast. Can someone take a look?",
      },
    ],
  },

  /* 2 */
  {
    id: "stacking",
    label: "STACKING",
    // Pulse comes up IN FRONT of the Chattr window that is already open, one
    // cascade step down-right of it: the desk starts stacking.
    apply: (s) => setPulse(show({ ...s, day: 1, minutes: 580 }, ["chattr", "pulse"]), 580, 3, 268),
    // The automated burst. Three sub-events on a timer while the actor just
    // watches Pulse: badge climbs, numbers climb, banners start landing.
    autos: [
      {
        delayMs: 1700,
        apply: (s) => markUnread(setPulse({ ...s, chattrBadge: 3 }, 590, 9, 322), "incidents"),
      },
      {
        delayMs: 3400,
        apply: (s) =>
          markUnread(setPulse({ ...s, chattrBadge: 7 }, 600, 17, 361), "incidents", "dm-priya"),
        // Not tied to a thread line (there is no matching message), so this one
        // keeps its original timer timing.
        banner: {
          agentId: "priya",
          sender: "Priya",
          preview: "support queue is filling up with checkout complaints",
        },
      },
      {
        delayMs: 5100,
        // Derek's DM goes through the same engine as every other NPC line even
        // though Pulse is front and the indicator is therefore invisible: if
        // the actor clicks Chattr mid-hold, the indicator is there, exactly
        // like the live app.
        exchange: [
          {
            kind: "npc",
            channel: "dm-derek",
            agentId: "derek",
            sender: "Derek",
            time: "9:41 AM",
            text: "Just saw the alert. What's the plan?",
            apply: (s) => markUnread({ ...s, chattrBadge: 12 }, "dm-derek"),
            banner: {
              agentId: "derek",
              sender: "Derek",
              preview: "Just saw the alert. What's the plan?",
            },
          },
        ],
      },
    ],
  },

  /* 3 */
  {
    id: "whos-taking-this",
    label: "WHO IS TAKING THIS",
    // Chattr comes back to the front; Pulse stays open behind it, still
    // showing the spike. The actor clicks Office in the dock during this beat,
    // which opens a third window live on camera.
    apply: (s) =>
      read(
        show({ ...s, day: 1, minutes: 605, chattrBadge: 0, unread: [] }, ["chattr", "pulse"], "chattr"),
        "dm-derek",
      ),
    exchange: [
      {
        kind: "npc",
        channel: "dm-derek",
        agentId: "derek",
        sender: "Derek",
        time: "10:04 AM",
        text: "Can you let me know who is taking this?",
        banner: {
          agentId: "derek",
          sender: "Derek",
          preview: "Can you let me know who is taking this?",
        },
      },
    ],
    // The actor clicks Office in the dock on camera and assigns Theo. Only Theo
    // gets a reaction; the roster shows he is out today, which is the joke.
    onAssign: {
      person: "Theo",
      delayMs: 2000,
      exchange: [
        {
          kind: "npc",
          channel: "dm-derek",
          agentId: "derek",
          sender: "Derek",
          time: "10:07 AM",
          text: "Theo wasn't even in the office today. Try again.",
          banner: {
            agentId: "derek",
            sender: "Derek",
            preview: "Theo wasn't even in the office today. Try again.",
          },
        },
      ],
    },
  },

  /* 4 */
  {
    id: "misread-1",
    label: "MISREAD 1 of 5",
    // 3.1% next to 407 attempts: the two confusable numbers, side by side.
    // Pulse front, Chattr staggered behind it.
    apply: (s) =>
      setPulse(show({ ...s, day: 1, minutes: 680 }, ["chattr", "pulse"]), 680, 3.1, 407, false),
  },

  /* 5 */
  {
    id: "misread-2",
    label: "MISREAD 2 of 5",
    // The player types the misread into Derek's DM, on camera, one character
    // at a time, then hits Enter.
    // Chattr forward, Pulse still open behind with the number the player is
    // about to misquote.
    apply: (s) =>
      read(show({ ...s, day: 1, minutes: 685 }, ["chattr", "pulse"], "chattr"), "dm-derek"),
    exchange: [
      {
        kind: "player",
        channel: "dm-derek",
        time: "11:25 AM",
        text: "Heads up, around 400 checkouts affected so far.",
      },
    ],
  },

  /* 6 */
  {
    id: "misread-3",
    label: "MISREAD 3 of 5",
    // Front stays on Derek's DM, so Priya's indicator (in #incidents) is
    // correctly hidden and the banner is the only way this lands.
    apply: (s) => ({
      ...show({ ...s, day: 1, minutes: 700 }, ["chattr", "pulse"], "chattr"),
      activeChannel: "dm-derek",
    }),
    exchange: [
      {
        kind: "npc",
        channel: "incidents",
        agentId: "priya",
        sender: "Priya",
        time: "11:40 AM",
        text: "just told Derek to loop you in for the postmortem",
        apply: (s) => markUnread(s, "incidents"),
        banner: {
          agentId: "priya",
          sender: "Priya",
          preview: "just told Derek to loop you in for the postmortem",
        },
      },
    ],
  },

  /* 7 */
  {
    id: "misread-4",
    label: "MISREAD 4 of 5",
    apply: (s) =>
      read(show({ ...s, day: 1, minutes: 702 }, ["chattr", "pulse"], "chattr"), "dm-priya"),
    exchange: [
      {
        kind: "player",
        channel: "dm-priya",
        time: "11:42 AM",
        text: "Already flagged it. Told him around 400 checkouts were affected.",
      },
    ],
  },

  /* 8 */
  {
    id: "misread-5",
    label: "MISREAD 5 of 5",
    // Priya's correction is the longest line in the ad, so its indicator holds
    // the longest — the point of the length-scaled formula.
    apply: (s) => ({
      ...show({ ...s, day: 1, minutes: 705 }, ["chattr", "pulse"], "chattr"),
      activeChannel: "dm-priya",
    }),
    exchange: [
      {
        kind: "npc",
        channel: "dm-priya",
        agentId: "priya",
        sender: "Priya",
        time: "11:45 AM",
        text: "That's not the right metric. 400 is the total attempts, not failures. Actual failure rate is closer to 3%. I'll update Derek with that.",
      },
    ],
  },

  /* 9 */
  {
    id: "course-correct",
    label: "COURSE CORRECT",
    // Office in front, Chattr behind it so Derek's thread is still on the desk
    // when he reacts. Clears the earlier assignment so the roster is live again
    // for take two.
    apply: (s) => show({ ...s, day: 1, minutes: 825, assignedTo: null }, ["chattr", "office"]),
    onAssign: {
      person: "Raj",
      delayMs: 1500,
      exchange: [
        {
          kind: "npc",
          channel: "dm-derek",
          agentId: "derek",
          sender: "Derek",
          time: "1:47 PM",
          text: "Raj is on it. Good.",
          banner: { agentId: "derek", sender: "Derek", preview: "Raj is on it. Good." },
        },
      ],
    },
  },

  /* 10 */
  {
    id: "pulse-payoff",
    label: "PULSE PAYOFF",
    // Scripted recovery, no real data: the failure rate walks 17 -> 12 -> 6 ->
    // 3 on a timer, so the success-rate hero climbs 83% -> 97% and the
    // sparkline draws the dip-and-recover hump. The badge walks the real
    // dashboard's three states with it: "Incident active" (red) while it is
    // still at the spike, "Recovering" (amber) on the way back, "Back to
    // baseline" (green) once it lands. Pulse front, Chattr staggered behind.
    apply: (s) => setPulse(show({ ...s, day: 1, minutes: 850 }, ["chattr", "pulse"]), 850, 17, 468),
    autos: [
      { delayMs: 1200, apply: (s) => setPulse(s, 860, 12, 468) },
      { delayMs: 2400, apply: (s) => setPulse(s, 870, 6, 468) },
      { delayMs: 3600, apply: (s) => setPulse(s, 880, DEMO_BASELINE_FAILURE_PCT, 468) },
    ],
  },

  /* 11 */
  {
    id: "reckoning",
    label: "RECKONING",
    apply: (s) => ({ ...s, day: 1, minutes: 1005, overlay: "scorecard" }),
  },

  /* 12 */
  {
    id: "closer-transition",
    label: "CLOSER, DAY 2",
    // A new day starts from a clean desk: only Chattr is open behind the
    // transition card, exactly like the real Desktop's login.
    apply: (s) => show({ ...s, day: 2, minutes: 540, overlay: "day2" }, ["chattr"]),
  },

  /* 13 */
  {
    id: "maya-follow-up",
    label: "MAYA FOLLOW UP",
    apply: (s) => read(show({ ...s, overlay: "none" }, ["chattr"]), "design-review"),
    exchange: [
      {
        kind: "npc",
        channel: "design-review",
        agentId: "maya",
        sender: "Maya",
        time: "9:01 AM",
        text: "hey, did you get a chance to look at the empty-state illustration? kinda need a decision before I move forward 👀",
        banner: {
          agentId: "maya",
          sender: "Maya",
          preview: "did you get a chance to look at the empty-state illustration?",
        },
      },
    ],
  },

  /* 14 */
  {
    id: "derek-assignment",
    label: "DEREK ASSIGNMENT",
    apply: (s) => read(show(s, ["chattr"]), "dm-derek"),
    exchange: [
      {
        kind: "npc",
        channel: "dm-derek",
        agentId: "derek",
        sender: "Derek",
        time: "9:03 AM",
        text: "Assigned you the AI Listing Assistant eval batch. Need your read before we scope the rollout.",
        banner: {
          agentId: "derek",
          sender: "Derek",
          preview: "Assigned you the AI Listing Assistant eval batch",
        },
      },
    ],
  },

  /* 15 */
  {
    id: "eval",
    label: "EVAL (final)",
    apply: (s) => ({ ...s, overlay: "eval" }),
  },
];
