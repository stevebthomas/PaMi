/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL AD/GAME CONTENT — safe to delete after ad shoot is done.
 *
 * The whole ~60 second ad, as data. Every clock reading, every message, every
 * Pulse number and every banner below is HARDCODED FOR FILMING: there is no
 * simulation, no scoring and no real logic anywhere in this folder. Nothing
 * here imports the game's store, data or lib layers, by design, so this route
 * can be deleted wholesale after the shoot.
 *
 * The engine (AdModeShot.tsx) walks SCRIPT one step at a time on ArrowLeft.
 * Each step gets a pure `apply` patch over SceneState, an optional notification
 * banner, optional `autos` (scripted sub-events fired on a timer once the step
 * becomes active) and an optional `onAssign` reaction for the Office beat the
 * actor drives by hand on camera.
 */

/* ------------------------------------------------------------------ types */

export type FrontApp = "chattr" | "pulse" | "taskflow" | "office";
export type Overlay = "none" | "scorecard" | "day2" | "eval";
export type BannerApp = "chattr" | "pulse";

export type ChannelId =
  | "general"
  | "incidents"
  | "design-review"
  | "random"
  | "dm-raj"
  | "dm-priya"
  | "dm-derek"
  | "dm-maya";

export type ChattrMessage = { id: string; sender: string; time: string; text: string };

export type BannerSpec = { app: BannerApp; sender: string; preview: string };

export type SceneState = {
  /** Rendered verbatim in the status bar. Jumps discretely between steps. */
  clock: string;
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
};

export type PulseState = {
  /** Checkout failure rate, in percent. Scripted value, not derived. */
  rate: number;
  /** Checkout attempts today. Scripted value, not derived. */
  attempts: number;
  /** Sim minute the tiles claim to be showing, drives the sparkline "now" dot. */
  t: number;
  /** Sparkline series. Scripted samples only, no real data behind it. */
  history: { t: number; rate: number }[];
};

export type StatePatch = (s: SceneState) => SceneState;

export type AutoEvent = {
  delayMs: number;
  apply?: StatePatch;
  banner?: BannerSpec;
};

export type AssignReaction = {
  /** Only this engineer triggers the reaction. Anyone else gets silence. */
  person: string;
  delayMs: number;
  apply?: StatePatch;
  banner?: BannerSpec;
};

export type Step = {
  id: string;
  /** Operator-facing label in the tiny filming HUD. Never part of the ad. */
  label: string;
  apply: StatePatch;
  banner?: BannerSpec;
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

export const DIRECT_MESSAGES: { id: ChannelId; label: string }[] = [
  { id: "dm-raj", label: "Raj" },
  { id: "dm-priya", label: "Priya" },
  { id: "dm-derek", label: "Derek" },
  { id: "dm-maya", label: "Maya" },
];

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

/* --------------------------------------------------------- patch builders */

/** Appends one message to a channel. Pure, so re-invoking the state updater
 * (React strict mode does) can never double-post. */
function say(
  s: SceneState,
  channel: ChannelId,
  sender: string,
  time: string,
  text: string,
): SceneState {
  const existing = s.messages[channel];
  return {
    ...s,
    messages: {
      ...s.messages,
      [channel]: [...existing, { id: `${channel}-${existing.length}`, sender, time, text }],
    },
  };
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
  clock: "Day 1 · 9:00 AM",
  frontApp: "chattr",
  overlay: "none",
  activeChannel: "design-review",
  unread: [],
  chattrBadge: 0,
  messages: {
    general: [
      {
        id: "general-0",
        sender: "Raj",
        time: "8:47 AM",
        text: "morning all. standup in 10.",
      },
    ],
    incidents: [],
    "design-review": [
      {
        id: "design-review-0",
        sender: "Maya",
        time: "8:58 AM",
        text: "pushed the new empty-state illustration, lmk what you think 👀",
      },
    ],
    random: [
      {
        id: "random-0",
        sender: "Derek",
        time: "8:31 AM",
        text: "whoever left the good coffee in the kitchen, thank you",
      },
    ],
    "dm-raj": [],
    "dm-priya": [],
    "dm-derek": [],
    "dm-maya": [],
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
    // rebuilds INITIAL_SCENE and re-enters this step.
    apply: (s) => s,
  },

  /* 1 */
  {
    id: "first-fire",
    label: "FIRST FIRE",
    apply: (s) => {
      const withClock: SceneState = { ...s, clock: "Day 1 · 9:15 AM", frontApp: "chattr" };
      return say(
        read(withClock, "incidents"),
        "incidents",
        "Priya",
        "9:14 AM",
        "Heads up. Seeing a spike in failed checkouts on Apple Pay. Volume's climbing fast. Can someone take a look?",
      );
    },
  },

  /* 2 */
  {
    id: "stacking",
    label: "STACKING",
    apply: (s) => setPulse({ ...s, clock: "Day 1 · 9:40 AM", frontApp: "pulse" }, 580, 3, 268),
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
        banner: {
          app: "chattr",
          sender: "Priya",
          preview: "support queue is filling up with checkout complaints",
        },
      },
      {
        delayMs: 5100,
        apply: (s) =>
          markUnread(
            say(
              { ...s, chattrBadge: 12 },
              "dm-derek",
              "Derek",
              "9:41 AM",
              "Just saw the alert. What's the plan?",
            ),
            "dm-derek",
          ),
        banner: { app: "chattr", sender: "Derek", preview: "Just saw the alert. What's the plan?" },
      },
    ],
  },

  /* 3 */
  {
    id: "whos-taking-this",
    label: "WHO IS TAKING THIS",
    apply: (s) => {
      const opened: SceneState = {
        ...s,
        clock: "Day 1 · 10:05 AM",
        frontApp: "chattr",
        chattrBadge: 0,
        unread: [],
      };
      return say(
        read(opened, "dm-derek"),
        "dm-derek",
        "Derek",
        "10:04 AM",
        "Can you let me know who is taking this?",
      );
    },
    banner: { app: "chattr", sender: "Derek", preview: "Can you let me know who is taking this?" },
    // The actor clicks Office in the dock on camera and assigns Theo. Only Theo
    // gets a reaction; the roster shows he is out today, which is the joke.
    onAssign: {
      person: "Theo",
      delayMs: 2000,
      apply: (s) =>
        say(
          s,
          "dm-derek",
          "Derek",
          "10:07 AM",
          "Theo wasn't even in the office today. Try again.",
        ),
      banner: {
        app: "chattr",
        sender: "Derek",
        preview: "Theo wasn't even in the office today. Try again.",
      },
    },
  },

  /* 4 */
  {
    id: "misread-1",
    label: "MISREAD 1 of 5",
    // 3.1% next to 407 attempts: the two confusable numbers, side by side.
    apply: (s) =>
      setPulse({ ...s, clock: "Day 1 · 11:20 AM", frontApp: "pulse" }, 680, 3.1, 407, false),
  },

  /* 5 */
  {
    id: "misread-2",
    label: "MISREAD 2 of 5",
    apply: (s) =>
      say(
        read({ ...s, clock: "Day 1 · 11:25 AM", frontApp: "chattr" }, "dm-derek"),
        "dm-derek",
        "You",
        "11:25 AM",
        "Heads up, around 400 checkouts affected so far.",
      ),
  },

  /* 6 */
  {
    id: "misread-3",
    label: "MISREAD 3 of 5",
    // Front stays on Derek's DM so the banner is the only way this lands.
    apply: (s) =>
      markUnread(
        say(
          { ...s, clock: "Day 1 · 11:40 AM", frontApp: "chattr", activeChannel: "dm-derek" },
          "incidents",
          "Priya",
          "11:40 AM",
          "just told Derek to loop you in for the postmortem",
        ),
        "incidents",
      ),
    banner: {
      app: "chattr",
      sender: "Priya",
      preview: "just told Derek to loop you in for the postmortem",
    },
  },

  /* 7 */
  {
    id: "misread-4",
    label: "MISREAD 4 of 5",
    apply: (s) =>
      say(
        read({ ...s, clock: "Day 1 · 11:42 AM", frontApp: "chattr" }, "dm-priya"),
        "dm-priya",
        "You",
        "11:42 AM",
        "Already flagged it. Told him around 400 checkouts were affected.",
      ),
  },

  /* 8 */
  {
    id: "misread-5",
    label: "MISREAD 5 of 5",
    apply: (s) =>
      say(
        { ...s, clock: "Day 1 · 11:45 AM", frontApp: "chattr", activeChannel: "dm-priya" },
        "dm-priya",
        "Priya",
        "11:45 AM",
        "That's not the right metric. 400 is the total attempts, not failures. Actual failure rate is closer to 3%. I'll update Derek with that.",
      ),
  },

  /* 9 */
  {
    id: "course-correct",
    label: "COURSE CORRECT",
    // Clears the earlier assignment so the roster is live again for take two.
    apply: (s) => ({ ...s, clock: "Day 1 · 1:45 PM", frontApp: "office", assignedTo: null }),
    onAssign: {
      person: "Raj",
      delayMs: 1500,
      apply: (s) => say(s, "dm-derek", "Derek", "1:47 PM", "Raj is on it. Good."),
      banner: { app: "chattr", sender: "Derek", preview: "Raj is on it. Good." },
    },
  },

  /* 10 */
  {
    id: "pulse-payoff",
    label: "PULSE PAYOFF",
    // Scripted recovery, no real data: the number walks 17 -> 12 -> 6 on a
    // timer and the sparkline picks up the hump.
    apply: (s) => setPulse({ ...s, clock: "Day 1 · 2:10 PM", frontApp: "pulse" }, 850, 17, 468),
    autos: [
      { delayMs: 1200, apply: (s) => setPulse(s, 860, 12, 468) },
      { delayMs: 2400, apply: (s) => setPulse(s, 870, 6, 468) },
    ],
  },

  /* 11 */
  {
    id: "reckoning",
    label: "RECKONING",
    apply: (s) => ({ ...s, clock: "Day 1 · 4:45 PM", overlay: "scorecard" }),
  },

  /* 12 */
  {
    id: "closer-transition",
    label: "CLOSER, DAY 2",
    apply: (s) => ({ ...s, clock: "Day 2 · 9:00 AM", overlay: "day2" }),
  },

  /* 13 */
  {
    id: "maya-follow-up",
    label: "MAYA FOLLOW UP",
    apply: (s) =>
      say(
        read({ ...s, overlay: "none", frontApp: "chattr" }, "design-review"),
        "design-review",
        "Maya",
        "9:01 AM",
        "hey, did you get a chance to look at the empty-state illustration? kinda need a decision before I move forward 👀",
      ),
    banner: {
      app: "chattr",
      sender: "Maya",
      preview: "did you get a chance to look at the empty-state illustration?",
    },
  },

  /* 14 */
  {
    id: "derek-assignment",
    label: "DEREK ASSIGNMENT",
    apply: (s) =>
      say(
        read({ ...s, frontApp: "chattr" }, "dm-derek"),
        "dm-derek",
        "Derek",
        "9:03 AM",
        "Assigned you the AI Listing Assistant eval batch. Need your read before we scope the rollout.",
      ),
    banner: {
      app: "chattr",
      sender: "Derek",
      preview: "Assigned you the AI Listing Assistant eval batch",
    },
  },

  /* 15 */
  {
    id: "eval",
    label: "EVAL (final)",
    apply: (s) => ({ ...s, overlay: "eval" }),
  },
];
