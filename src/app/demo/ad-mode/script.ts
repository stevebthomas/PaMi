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
 * The engine (AdModeShot.tsx) walks SCRIPT one step at a time on ArrowRight,
 * and one step BACK on ArrowLeft. Each step gets a pure `apply` patch over
 * SceneState, an optional notification banner, an optional `exchange` (the
 * sequenced typing timeline — see below), optional `autos` (scripted sub-events
 * fired on a timer once the step becomes active), an optional `autoAssign` (the
 * Office assignment the script makes on its own if the actor doesn't) and an
 * optional `onAssign` reaction that answers whichever of the two got there
 * first.
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
 *
 * FOLDING. `completeStep` / `completedTimeline` at the bottom of this file
 * replay the very same step/auto/exchange/assign data as a pure reduction, with
 * every delay treated as zero: they are the one definition of "what this beat
 * looks like once it has finished playing". ArrowLeft (retake: rebuild beats
 * 0..n-2, then re-enter n-1) is built on them, so there is no second, hand-
 * written table of per-beat end states to drift out of sync with the script.
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
  | "dm-marcus"
  // Theo's thread. Empty for most of the take: its one line is the automated
  // away-reply the WRONG PICK beat triggers (see that step).
  | "dm-theo";

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

/**
 * The assignment the SCRIPT makes on its own, so the beat plays without anyone
 * touching the mouse: `delayMs` after beat entry the named engineer's card
 * flips to "Assigned ✓", exactly as a click would leave it, and the step's
 * `onAssign` reaction then answers it on its own delay.
 *
 * A beat entry has room for exactly ONE assignment. Whichever comes first — the
 * actor clicking any Assign button, or this timer — claims it and the other
 * becomes a no-op, so a manual take on camera cannot double-assign or double-
 * fire the reaction.
 */
export type AutoAssign = {
  person: string;
  delayMs: number;
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
  autoAssign?: AutoAssign;
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
 * point in the day: the three static CHANNELS DMs (Raj, Priya, Derek) in their
 * shipping order, then every DM_CONTACTS registry entry whose `availableWhen`
 * predicate is currently true, in registry order.
 *
 * Mid-morning, with no fix path chosen yet, the live registry yields Marcus
 * alone: Jordan and Chen only appear once `tradeoffChoice` is set, and Maya is
 * not a DM contact at all (her thread is #design-review).
 *
 * THEO is the shoot's one addition. He is unregistered in the live sim (no
 * dialogue, no persona), but the ad's WRONG PICK beat needs his automated
 * away-reply to land in a real thread, so the take carries him as if he were a
 * registry contact — which puts him AFTER the static three and after Marcus,
 * the last of the currently-available registry entries, exactly where appending
 * one more DM_CONTACTS entry would place him. Hardcoded for filming.
 */
export const DIRECT_MESSAGES: { id: ChannelId; label: string }[] = [
  { id: "dm-raj", label: "Raj" },
  { id: "dm-priya", label: "Priya" },
  { id: "dm-derek", label: "Derek" },
  { id: "dm-marcus", label: "Marcus" },
  { id: "dm-theo", label: "Theo" },
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

/**
 * Appends one message to a channel. Pure, so re-invoking the state updater
 * (React strict mode does) can never double-post.
 *
 * APPEND-ONLY, AND LOUD ABOUT IT. This is the ONE writer of `messages`, and it
 * only ever spreads the existing thread — nothing in this file, or in the
 * engine, may replace a thread or the map. The two guards below turn the two
 * ways a line could still silently VANISH on camera into a hard failure during
 * a rehearsal rather than a mystery in a take:
 *
 *  - a channel with no seeded thread (a new ChannelId that reached the sidebar
 *    or a scripted line but never got its `[]` in INITIAL_SCENE) renders as an
 *    empty channel, which reads exactly like "the history disappeared";
 *  - a duplicate id is a duplicate React key in MessageListView, and React
 *    renders ONE row for two messages — so the earlier line (e.g. Priya's 9:14
 *    seed, whose hand-written id shares this same `${channel}-${n}` namespace)
 *    would appear to be replaced by the newer one.
 */
function say(
  s: SceneState,
  channel: ChannelId,
  agentId: AgentId,
  sender: string,
  time: string,
  text: string,
): SceneState {
  const existing = s.messages[channel];
  if (!existing) {
    throw new Error(`ad-mode: channel "${channel}" has no seeded thread in INITIAL_SCENE`);
  }
  const id = `${channel}-${existing.length}`;
  if (existing.some((m) => m.id === id)) {
    throw new Error(`ad-mode: duplicate message id "${id}" in ${channel}`);
  }
  return {
    ...s,
    messages: {
      ...s.messages,
      [channel]: [...existing, { id, agentId, sender, time, text }],
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
  minutes: 555, // 9:15 AM — the incident's opening frame (see INCIDENT_MINUTE).
  // The take now OPENS already inside the incident: Chattr alone, centered,
  // exactly like the real desktop's first window at login, but on #incidents
  // rather than an empty inbox — this is the folded, already-landed state of
  // what used to be a quiet opener followed by Priya's line typed in live. See
  // the (inert) "first-fire" step below for why that beat still exists in
  // SCRIPT.
  windows: ["chattr"],
  frontApp: "chattr",
  overlay: "none",
  activeChannel: "incidents",
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
    // Priya's opening line: the take's very first frame, already landed. No
    // typing indicator plays for it — see the "first-fire" step's comment.
    incidents: [
      {
        id: "incidents-0",
        agentId: "priya",
        sender: "Priya",
        time: "9:14 AM",
        text: "Heads up. Seeing a spike in failed checkouts on Apple Pay. Volume's climbing fast. Can someone take a look?",
        history: true,
      },
    ],
    // Kept as seeded history even though #design-review is not on camera at
    // beat 0: the Day-2 "maya-follow-up" beat appends to this same thread, and
    // needs the 8:58 AM line already in it for that follow-up to read as a
    // follow-up.
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
    // Theo's thread is empty until the WRONG PICK beat's automated away-reply.
    // Seeded here (rather than created on first use) because `say` is
    // append-only and refuses to write to an unseeded channel.
    "dm-theo": [],
  },
  /**
   * Scripted Pulse values. Hardcoded for filming, no real logic.
   *
   * THE TAKE OPENS INSIDE THE INCIDENT, so these are already degraded: Priya's
   * 9:14 line above has reported the spike and the clock reads 9:15, so the
   * dashboard's own numbers have to agree with the message the audience just
   * read. The series carries two healthy PRE-incident samples (8:30 and 9:00,
   * both earlier than Priya's message) so the sparkline has a line to draw and
   * a baseline to fall away from, and then the first degraded reading at 9:15 —
   * INCIDENT_MINUTE, the minute the sparkline draws its incident marker at. No
   * sample at or after 9:15 is ever healthy again until the recovery at the
   * PULSE PAYOFF beat, so nothing between Priya's message and the reveal can
   * put a healthy frame on camera.
   */
  pulse: {
    rate: DEMO_ALARM_FAILURE_PCT,
    attempts: 289,
    t: INCIDENT_MINUTE,
    history: [
      { t: 510, rate: 2.6 },
      { t: 540, rate: 3 },
      { t: INCIDENT_MINUTE, rate: DEMO_ALARM_FAILURE_PCT },
    ],
  },
  assignedTo: null,
};

/* ----------------------------------------------------------------- SCRIPT */

export const SCRIPT: Step[] = [
  /* 0 */
  {
    id: "first-fire",
    label: "FIRST FIRE",
    // The incident has already landed by the time the take starts: INITIAL_SCENE
    // carries #incidents active with Priya's line seeded as history at 9:15 AM
    // (see INITIAL_SCENE). This step's patch is therefore the identity, so
    // mount, R and an ArrowLeft back to beat 0 all land on exactly the same
    // frame, with nothing left to type or fold. The step stays in SCRIPT
    // (rather than being deleted along with the beat that used to precede it)
    // purely to hold this beat's place for the operator HUD and the ArrowLeft
    // fold; it has no work left to do.
    //
    // Pulse is not on the desk yet, but INITIAL_SCENE's dashboard numbers are
    // already degraded (see its `pulse` comment), so an actor who opens Pulse
    // from the dock on this beat gets a 91% / "Incident active" board that
    // agrees with Priya's line rather than a healthy one that contradicts it.
    apply: (s) => s,
  },

  /* 1 */
  {
    id: "stacking",
    label: "STACKING",
    // Pulse comes up IN FRONT of the Chattr window that is already open, one
    // cascade step down-right of it: the desk starts stacking.
    //
    // ALREADY DIPPED ON THE FIRST PAINTED FRAME. Pulse must never open at the
    // healthy 97% here: Priya's 9:14 line (beat 0) has already told the
    // audience checkouts are failing, so a healthy dashboard that snaps red a
    // second and a half later reads as staged AND contradicts the message
    // still on screen behind it. The entry patch therefore lands the beat's
    // FIRST degraded reading — 9% failure / 91% success over 322 attempts — in
    // the very same update that opens the window, so the window's first paint
    // is red-toned with the incident badge already up. `enterStep` applies this
    // patch before the layout effect places the window, so there is no frame in
    // which the Pulse body exists with the old numbers in it.
    //
    // This is the OLD +1.7s auto, folded into beat entry, and it brings that
    // auto's other work with it (Chattr badge 3, #incidents unread), so every
    // bit of the burst's content survives and the climb keeps its cadence: 9%
    // on entry, then the three stakeholder pings below.
    apply: (s) =>
      markUnread(
        setPulse(
          show({ ...s, day: 1, minutes: 580, chattrBadge: 3 }, ["chattr", "pulse"]),
          580,
          DEMO_ALARM_FAILURE_PCT,
          322,
        ),
        "incidents",
      ),
    // The automated burst: THREE stakeholders piling on while the actor just
    // watches Pulse — Priya, then Raj, then Derek — over a badge and a failure
    // rate that keep climbing underneath them.
    //
    // Every one of the three is a REAL thread line, so each banner is tied to
    // the message it previews and each unread ring points at something that
    // exists. Priya's and Raj's indicator holds are PINNED (`indicatorMs`)
    // rather than length-scaled, purely to make the on-camera order of the
    // three banners deterministic: pinned, they land at ~2.5s and ~3.4s, both
    // strictly before the earliest Derek's un-pinned formula can produce
    // (~4.4s), so a take can never show the pile-up out of order. The holds
    // are invisible anyway — Pulse is front, and #incidents is the open
    // channel — but they are still real, so clicking Chattr mid-hold shows the
    // indicator exactly like the live app.
    autos: [
      {
        delayMs: 1700,
        apply: (s) => markUnread(setPulse({ ...s, chattrBadge: 7 }, 600, 17, 361), "incidents"),
        exchange: [
          {
            kind: "npc",
            channel: "dm-priya",
            agentId: "priya",
            sender: "Priya",
            time: "9:42 AM",
            text: "support queue is filling up with checkout complaints",
            indicatorMs: 800,
            apply: (s) => markUnread(s, "dm-priya"),
            banner: {
              agentId: "priya",
              sender: "Priya",
              preview: "support queue is filling up with checkout complaints",
            },
          },
        ],
      },
      {
        delayMs: 2600,
        // The engineering side hearing about it independently: Raj is already
        // in the logs before anyone has asked him to be.
        exchange: [
          {
            kind: "npc",
            channel: "dm-raj",
            agentId: "raj",
            sender: "Raj",
            time: "9:43 AM",
            text: "Saw the Pulse spike. Pulling logs now. Give me a few.",
            indicatorMs: 800,
            apply: (s) => markUnread(s, "dm-raj"),
            banner: {
              agentId: "raj",
              sender: "Raj",
              preview: "Saw the Pulse spike. Pulling logs now. Give me a few.",
            },
          },
        ],
      },
      {
        delayMs: 3400,
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

  /* 2 */
  {
    id: "whos-taking-this",
    label: "WHO IS TAKING THIS",
    // Chattr comes back to the front; Pulse stays open behind it, still
    // showing the spike. A full three-line exchange in Derek's DM: he asks, the
    // player answers on camera through the real composer, and he signs off. The
    // NEXT beat is the player making good on that answer — badly.
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
      // Typed into the REAL composer, character by character, and sent through
      // the real Enter path — the same engine every other player line uses.
      {
        kind: "player",
        channel: "dm-derek",
        time: "10:05 AM",
        text: "Should I assign someone from engineering?",
      },
      // No banner: this thread is the one on screen, so the line lands in front
      // of the camera already. A banner here would announce a message the
      // audience is watching arrive — the same visible-channel rule the engine
      // applies to the typing indicator.
      {
        kind: "npc",
        channel: "dm-derek",
        agentId: "derek",
        sender: "Derek",
        time: "10:06 AM",
        text: "Sounds good, just keep me posted.",
      },
    ],
  },

  /* 3 */
  {
    id: "wrong-pick",
    label: "WRONG PICK",
    // The answer to Derek's question, and it is the wrong one. Office opens in
    // front of Chattr (Pulse steps off the desk for this beat).
    //
    // The beat plays ITSELF: `autoAssign` flips Theo's card to "Assigned ✓"
    // 1.2s in — the same UI a click leaves behind — and `onAssign` then lands
    // the consequence. Only Theo gets a reaction; the roster card next to the
    // button already says "Out today", which is the joke.
    //
    // THE CONSEQUENCE COMES FROM THEO, NOT FROM DEREK. Nobody narrates the
    // mistake: the assignment simply bounces back off an out-of-office
    // auto-reply, and the player is left to notice. It fires 400ms after the
    // assignment lands and, uniquely in this script, with `indicatorMs: 0` — no
    // length-scaled "Theo is typing" hold — because an away-reply is a machine
    // answering instantly, not a person composing. The banner is the only way
    // it reads on camera (Office is front, and Theo's DM is not the thread on
    // screen), so it carries Theo's own sprite.
    //
    // The actor can still beat the script to it: clicking any Assign button
    // first claims the beat's one assignment and cancels the auto, and clicking
    // Theo runs this exact same reaction (see AdModeShot's assignClaimed).
    apply: (s) => show({ ...s, day: 1, minutes: 607 }, ["chattr", "office"], "office"),
    autoAssign: { person: "Theo", delayMs: 1200 },
    onAssign: {
      person: "Theo",
      delayMs: 400,
      exchange: [
        {
          kind: "npc",
          channel: "dm-theo",
          agentId: "theo",
          sender: "Theo",
          time: "10:07 AM",
          text: "I'm not in the office today.",
          indicatorMs: 0,
          // Theo's DM is not the thread on screen, so it takes the unread
          // treatment the real sidebar would give it.
          apply: (s) => markUnread(s, "dm-theo"),
          banner: {
            agentId: "theo",
            sender: "Theo",
            preview: "I'm not in the office today.",
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
    // ANSWERING IN THE THREAD THAT ASKED. Priya's two setup lines — her 9:14
    // seed and the 11:40 postmortem line the beat before — are both in
    // #incidents, so the player's reply to them belongs in #incidents too, not
    // in a side DM. Opening the channel is also what clears the unread ring the
    // previous beat left on it, exactly like the real app.
    apply: (s) =>
      read(show({ ...s, day: 1, minutes: 702 }, ["chattr", "pulse"], "chattr"), "incidents"),
    exchange: [
      {
        kind: "player",
        channel: "incidents",
        time: "11:42 AM",
        text: "Already flagged it. Told him around 400 checkouts were affected.",
      },
    ],
  },

  /* 8 */
  {
    id: "misread-5",
    label: "MISREAD 5 of 5",
    // The correction lands in #incidents, directly under the line it corrects,
    // and #incidents is the thread on screen — so this is the one NPC line in
    // the ad whose indicator is actually VISIBLE while it holds. It is also the
    // longest line in the ad, so it holds the longest: the length-scaled
    // formula finally gets to be on camera. No banner, per the same
    // visible-channel rule — the audience is watching it arrive.
    apply: (s) => ({
      ...show({ ...s, day: 1, minutes: 705 }, ["chattr", "pulse"], "chattr"),
      activeChannel: "incidents",
    }),
    exchange: [
      {
        kind: "npc",
        channel: "incidents",
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
    // Office in front, Chattr behind it. Clears the earlier assignment so the
    // roster is live again for the right pick.
    //
    // Chattr is still showing #incidents from the misread beats, so Derek's
    // confirmation lands in a thread that is NOT on screen and its banner is
    // what carries it — the same rule every other off-screen line follows.
    //
    // Symmetrical with WRONG PICK: the script assigns Raj itself 1.5s in and
    // Derek's confirmation follows 1.5s after that, unless the actor clicks an
    // Assign button first — in which case that click claims the beat's one
    // assignment, the auto is cancelled, and clicking Raj plays this same
    // reaction.
    apply: (s) => show({ ...s, day: 1, minutes: 825, assignedTo: null }, ["chattr", "office"]),
    autoAssign: { person: "Raj", delayMs: 1500 },
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
    id: "raj-root-cause",
    label: "RAJ ROOT CAUSE",
    // The engineer reports back, and the ad finally says WHAT was wrong. This
    // is the setup the recovery beat needs: without it the numbers just fall
    // on their own, which reads as the incident fixing itself.
    //
    // Chattr comes forward with Raj's DM open (opening it clears the unread
    // ring the STACKING burst left on him, exactly like the real app), and
    // Pulse is declared FIRST so it takes the earlier cascade step and sits
    // staggered behind — still showing the spike Raj is about to explain, and
    // already in place for the payoff beat that follows.
    //
    // Normal length-scaled indicator, and no banner: this is the thread on
    // screen, so the audience watches Raj compose it rather than being told
    // about it by a notification.
    apply: (s) => read(show({ ...s, day: 1, minutes: 835 }, ["pulse", "chattr"], "chattr"), "dm-raj"),
    exchange: [
      {
        kind: "npc",
        channel: "dm-raj",
        agentId: "raj",
        sender: "Raj",
        time: "1:55 PM",
        text: "Confirmed. Apple Pay token validation is timing out on their end, not ours. We shipped a retry buffer to absorb it. Rate should settle in the next few minutes.",
      },
    ],
  },

  /* 11 */
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

  /* 12 */
  {
    id: "reckoning",
    label: "RECKONING",
    apply: (s) => ({ ...s, day: 1, minutes: 1005, overlay: "scorecard" }),
  },

  /* 13 */
  {
    id: "closer-transition",
    label: "CLOSER, DAY 2",
    // A new day starts from a clean desk: only Chattr is open behind the
    // transition card, exactly like the real Desktop's login.
    apply: (s) => show({ ...s, day: 2, minutes: 540, overlay: "day2" }, ["chattr"]),
  },

  /* 14 */
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

  /* 15 */
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

  /* 16 */
  {
    id: "eval",
    label: "EVAL (final)",
    apply: (s) => ({ ...s, overlay: "eval" }),
  },
];

/* ------------------------------------------------- folding a finished beat */

/**
 * THE ONE STANDING INVARIANT OF THIS ROUTE: chat history never shrinks.
 *
 * Real threads only ever grow, so no beat — not a step `apply`, not an `auto`,
 * not an assign reaction, and not the Day 2 transition — may drop a line that
 * has already been on camera. That includes the seeds: Priya's 9:14 AM
 * #incidents message is the first thing the ad shows, and it has to still be
 * there at the closer.
 *
 * Asserted here rather than trusted, because the failure mode is silent: a
 * patch that rebuilt `messages` instead of spreading it would simply paint a
 * shorter thread, and nothing else in the take would look wrong. `completeStep`
 * runs on every ArrowLeft retake and on every fold, so this check sees every
 * beat's real end state; `say`'s own two guards (see above) cover the live
 * forward path, where a line lands through `landLine` instead.
 */
export function assertThreadsGrow(
  before: SceneState,
  after: SceneState,
  stepId: string,
): void {
  for (const channel of Object.keys(before.messages) as ChannelId[]) {
    const had = before.messages[channel].length;
    const has = after.messages[channel]?.length ?? -1;
    if (has < had) {
      throw new Error(
        `ad-mode: beat "${stepId}" left ${channel} with ${has} message(s), down from ${had}; ` +
          `chat history is append-only`,
      );
    }
  }
}

/**
 * The assignment half of a completed beat: the card is flipped, and the step's
 * reaction (if this is the person it answers) has fully landed.
 */
function completeAssign(s: SceneState, step: Step, person: string): SceneState {
  let next: SceneState = { ...s, assignedTo: person };
  const reaction = step.onAssign;
  if (!reaction || reaction.person !== person) return next;
  if (reaction.apply) next = reaction.apply(next);
  for (const line of reaction.exchange ?? []) next = landLine(next, line);
  return next;
}

/**
 * One beat, played to its END, instantly and purely.
 *
 * This is the fast-forward semantics as a reduction: the step's patch, then
 * every scripted line landed, every auto applied and the beat's own assignment
 * made — no timers, no indicators, no banners, no composer text. It reads the
 * SAME step/auto/exchange/assign data the engine plays, so a beat can never
 * have two different definitions of "finished".
 *
 * ORDERING. A beat's exchange and its autos run as parallel chains live, so the
 * fold needs one deterministic rule: the step exchange first, then the autos in
 * ascending `delayMs`, then the assignment. No beat in SCRIPT mixes an exchange
 * with autos or an assignment, so this rule is exact for the shoot as written,
 * and it stays the obvious reading if one ever does.
 */
export function completeStep(state: SceneState, step: Step): SceneState {
  let s = step.apply(state);
  for (const line of step.exchange ?? []) s = landLine(s, line);
  for (const auto of [...(step.autos ?? [])].sort((a, b) => a.delayMs - b.delayMs)) {
    if (auto.apply) s = auto.apply(s);
    for (const line of auto.exchange ?? []) s = landLine(s, line);
  }
  if (step.autoAssign) s = completeAssign(s, step, step.autoAssign.person);
  // A finished beat has an empty composer and no indicator on screen: the send
  // path clears one and the landing line clears the other.
  const done: SceneState = { ...s, composer: "", typing: null };
  assertThreadsGrow(state, done, step.id);
  return done;
}

/**
 * The completed state of beats 0..upTo, in order (empty when `upTo` < 0).
 *
 * The array, not just the last entry, is what the retake needs: the window
 * layer replays the real cascade over each beat's declared window set, so a
 * rebuilt desk is placed exactly as stepping forward would have placed it.
 */
export function completedTimeline(upTo: number, from: SceneState = INITIAL_SCENE): SceneState[] {
  const states: SceneState[] = [];
  let s = from;
  for (let i = 0; i <= upTo && i < SCRIPT.length; i += 1) {
    s = completeStep(s, SCRIPT[i]);
    states.push(s);
  }
  return states;
}
