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
 * Pacing is data, not code, and as of the director's blanket-gap note it is ONE
 * number: GAP_MS below is the flat two-second gap between every two consecutive
 * visible motions in the take — entry holds, exchange lines, autos, assign
 * lead-ins, the lot. PLAYER_TYPING keeps the per-character cadence (a duration,
 * not a gap), and any single line can still override the defaults (`typing` on
 * a player line, `indicatorMs` on an NPC line) without touching the engine.
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
export type FrontApp = "chattr" | "pulse" | "taskflow" | "office" | "docs";
/** The full-screen cards the ad puts over the desk. There is no "eval" member
 * any more: the take now ENDS on the evals document (see the last step in
 * SCRIPT), so nothing sets an eval overlay and nothing renders one. The shared
 * EvalScreen component itself is untouched — /demo/day2 still films it. */
export type Overlay = "none" | "scorecard" | "day2";

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

/** A document chip under a message, rendered through MessageListView's own
 * attachment markup. `key` is the chip's React key; clicking it raises the
 * scripted Docs window, the same shape the real chip's onOpen has. */
export type MessageAttachment = { key: string; label: string };

export type ChattrMessage = {
  id: string;
  /** Resolves the real PixelAvatar sprite for this line. */
  agentId: AgentId;
  sender: string;
  time: string;
  text: string;
  /** Document chip(s) rendered under the body, exactly like the live thread. */
  attachment?: MessageAttachment;
  /**
   * Renders the ad's one bespoke chip under this line: "Open Pulse", which
   * opens/raises the Pulse window. Unlike `attachment` (a document, rendered
   * through MessageListView's own generic chip surface) this one needs the
   * PULSE app icon rather than the doc FileText, and that icon is hardcoded
   * inside the shipping component — so the ad renders it itself, from the same
   * class string, rather than changing a shared component for a demo. See
   * ScriptedChattr.
   */
  pulseChip?: true;
  /**
   * The ad's second bespoke chip: "Open Office", under Derek's "Do it." line.
   * Identical in every respect to `pulseChip` (same real attachment-chip
   * markup, same pressed state, same open-or-raise click path) except that it
   * carries the OFFICE app's own AppIcon glyph. Rendered by ScriptedChattr for
   * exactly the same reason: the shared component hardcodes the doc icon.
   *
   * NOTE FOR THE DIRECTOR: the referenced spec file
   * `ad-mode-office-reference-button.md` does not exist anywhere in this repo
   * (searched the whole tree). This chip is therefore built by MIRRORING the
   * Open Pulse chip spec above, point for point. If that document turns up and
   * says something different, this is the place to reconcile it.
   */
  officeChip?: true;
  /** Thread history: this line was already on screen before the take started,
   * so it renders instantly and never runs through the typing engine. Only
   * INITIAL_SCENE seeds carry it. */
  history?: true;
};

/**
 * A notification banner.
 *
 * POLICY (director): EVERY NPC MESSAGE IN THE AD FIRES ONE, and a player line
 * never does. There is no longer a visible-channel exemption — a line landing
 * in the thread already on camera banners exactly like one landing in a thread
 * that is not. `assertEveryNpcLineBanners` at the bottom of this file enforces
 * it, so a new NPC line cannot be added silently without its banner.
 */
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
 * GAP_MS — THE ONE PACING NUMBER IN THE AD.
 *
 * DIRECTOR'S INSTRUCTION, and it supersedes every per-beat judgement call this
 * file used to make: between any two consecutive VISIBLE motions or state
 * changes on camera, anywhere in the take, there is a flat two-second gap. Not
 * a band, not a length-scaled formula, not a per-beat table — one number.
 *
 * WHAT THIS COVERS (all of it now reads GAP_MS, not a local constant):
 *   - every beat's ENTRY HOLD, i.e. keypress -> the beat's picture landing
 *     (`entryHoldMs` below);
 *   - the gap from a beat landing to the first line of its exchange starting to
 *     type / to show a typing indicator (the engine's step-exchange lead-in);
 *   - inside an exchange, indicator-appears -> message-lands, and
 *     message-lands -> the next event starting (the engine sleeps GAP_MS
 *     between consecutive exchange events) — including the scripted channel
 *     SWITCH, which is an exchange event like any other (see SwitchEvent);
 *   - the pause between a player line's last character and the Enter that sends
 *     it (`PLAYER_TYPING.sendPauseMs`);
 *   - every `auto` delay: the STACKING burst's three pings (and therefore the
 *     banner-to-banner stagger in the stack), the PULSE PAYOFF recovery walk
 *     (17 -> 12 -> 6 -> 3) and the RECKONING scorecard;
 *   - every scripted `autoAssign` lead-in and every `onAssign` reaction delay,
 *     with the one flagged exception below.
 *
 * WHAT IT DOES NOT COVER — the two kinds of number that are NOT inter-event
 * gaps, and are therefore left alone on purpose:
 *
 *   DURATIONS of one continuous animation. The player's per-character typing
 *   cadence and its punctuation pause (PLAYER_TYPING, below — the characters of
 *   one line are one motion, not N), the Pulse count-up (PULSE_COUNT_UP_MS), the
 *   "Open Pulse" chip flash (PULSE_CHIP_PRESS_MS), the banner slide-down push
 *   (BANNER_PUSH_MS in Banners.tsx), the scorecard's staggered bar fills and the
 *   Day 2 progress bar (ScorecardReveal.tsx), and every CSS fade.
 *
 *   SIMULTANEOUS CAUSE-AND-EFFECT pairs, which are deliberately the SAME frame
 *   and so have no gap between them at all:
 *     · the "Open Pulse" chip releasing and the Pulse window opening (STACKING);
 *     · a message landing and its banner appearing (every banner in the ad);
 *     · a message landing and its own `apply` (an unread ring, a badge count);
 *     · an NPC's indicator clearing and the line it was announcing landing;
 *     · a beat's patch and the start of an OFF-CAMERA typing indicator — an
 *       indicator in a thread that is not on screen is not a motion at all, so
 *       it rides with the patch and the message it announces lands one GAP_MS
 *       later, on the metronome (see `stepExchangeLeadInMs`);
 *     · an `auto`'s own patch and the start of the exchange it owns — the
 *       STACKING burst's first ping climbs the Pulse numbers in the same frame
 *       Priya's indicator opens, which costs nothing because that indicator is
 *       in a DM behind the front window and is not on camera at all;
 *     · a beat's clock flip and the rest of that beat's patch (the RECKONING
 *       clock-flips-with-the-landing rule, which stands).
 *
 * THE EXCEPTIONS, in full. There are exactly three, and each is flagged where
 * it lives:
 *   1. beat 0 ("first-fire") has a ZERO entry hold: it is the LOAD FRAME and
 *      must paint instantly on mount, on R and on an ArrowLeft back to 0.
 *   2. THEO'S AWAY REPLY still fires 400ms after the assignment, with no typing
 *      indicator at all — see the WRONG PICK beat. It is a CHARACTER POINT, not
 *      pacing: an out-of-office auto-responder answers instantly, and stretching
 *      it to two seconds (or giving it an indicator) turns a machine into a
 *      person and kills the joke. RECOMMENDED TO KEEP; flip it to GAP_MS here if
 *      the director wants the blanket rule with no carve-outs at all.
 *   3. BANNER_HOLD_MS (AdModeShot.tsx) stays at 2600ms — a banner's on-screen
 *      DWELL, which must outlast GAP_MS or the next banner would arrive exactly
 *      as the previous one starts leaving and the stack would never be seen to
 *      push.
 */
export const GAP_MS = 2000;

/**
 * Player typing cadence, in milliseconds. Retune the ad's on-camera typing
 * speed here; no engine change is needed.
 *
 *  perCharMinMs/perCharMaxMs  per-character delay, drawn uniformly at random
 *                             per character so the rhythm reads human rather
 *                             than metronomic. A DURATION (one line typing is
 *                             one motion), so the blanket gap rule leaves it be.
 *  punctuationPauseMs         added AFTER any PUNCTUATION character, the little
 *                             beat a person takes at a comma or a full stop.
 *                             Part of the same cadence, so also untouched.
 *  sendPauseMs                the pause between the last character and the
 *                             Enter keypress. This one IS an inter-event gap —
 *                             the finished line and the sent message are two
 *                             separate things to look at — so it is GAP_MS.
 */
export const PLAYER_TYPING = {
  perCharMinMs: 30,
  perCharMaxMs: 70,
  punctuationPauseMs: 250,
  sendPauseMs: GAP_MS,
};

export type PlayerTypingConfig = typeof PLAYER_TYPING;

/** Per-line override for a scripted player message. Every field is optional and
 * falls back to PLAYER_TYPING. */
export type PlayerTypingOverride = Partial<PlayerTypingConfig>;

/** Characters that earn the extra `punctuationPauseMs` beat. */
export const PUNCTUATION = /[.,!?;:]/;

/**
 * THE NPC TYPING INDICATOR HOLD IS NOW FLAT — INSTRUCTED CHANGE.
 *
 * This file used to scale the hold with the line's length:
 *
 *   clamp((600 + 18 * messageLength) * (1 ± 0.2), 900, 3800)
 *
 * so a long correction from Priya read as genuinely being composed. The
 * director's blanket rule replaces it: indicator-appears and message-lands are
 * two consecutive visible motions like any other pair, so the hold is GAP_MS
 * for every NPC line in the ad, regardless of length, with no jitter (which
 * also makes every take frame-identical). The formula above is recorded here
 * verbatim so it can be restored in one edit if the director wants it back.
 *
 * THE PER-LINE OVERRIDE MECHANISM IS UNCHANGED: any NpcLine may still pin its
 * own `indicatorMs`, and one does — Theo's away reply uses `indicatorMs: 0`
 * (exception 2 in the GAP_MS block above).
 */

/* ------------------------------------------------------------- beat pacing */

/**
 * How long the scripted Pulse hero (and the failure-rate tile) takes to COUNT
 * from the previous reading to the new one. Purely a render decoration in
 * ScriptedApps — it never touches scene state, the recorded sparkline samples
 * or the real PulseMock — so a recovery step still lands as one discrete
 * scripted value; it just stops the digits from teleporting.
 */
export const PULSE_COUNT_UP_MS = 500;

/* --------------------------------------------------------- entry holds */

/**
 * THE ENTRY HOLD: the pause between the operator's ArrowRight and the beat's
 * visible change actually landing.
 *
 * Without it every beat cut on the keypress — the clock flipped, windows opened
 * and closed, Pulse's numbers changed and channels switched all in the same
 * frame as the press. On camera that reads as a jump cut per beat. With it the
 * previous beat's finished frame HOLDS for a moment, and only then does the new
 * one land, so the edit has something to cut on and the eye has time to arrive
 * before the picture changes.
 *
 * MECHANICALLY it is the beat's `apply` patch, deferred: `enterStep` puts the
 * beat on the HUD but changes nothing on screen, and the timeline effect's
 * first chain sleeps this long and only then applies the patch (and the
 * step-level banner), after which the beat's exchange/autos start as before —
 * so their own delays still count from the moment the beat is visibly on
 * screen, not from the keypress. Because it goes through `sleep(session, …)`
 * like every other scripted delay, ArrowRight mid-hold flushes it and advances
 * off the one press, ArrowLeft replays it, R cancels it, and the HUD's
 * "typing…" cue is lit while it runs. And because it is TIMING ONLY, the fold
 * is untouched: `completeStep` never reads this table.
 *
 * ONE NUMBER, NOT A TABLE — INSTRUCTED CHANGE. This used to be a seventeen-row
 * table that graded each beat's hold by how big its change was (2000 for a
 * reveal, 1600 for a structural change, 1200 for an ordinary one, 600 for the
 * reckoning). The director's blanket rule replaces all of it: a keypress and
 * the beat it lands are two consecutive visible motions like any other pair, so
 * EVERY beat holds GAP_MS. The only entry left is the load frame.
 *
 * A pleasant side effect: the old table's failure mode — a new beat added
 * without a row, silently reintroducing the jump cut — is now impossible, so
 * `entryHoldMs` no longer needs its dev-only guard against an unpaced beat.
 */

/**
 * The beats that land INSTANTLY, with no hold at all. Exactly one, and it is
 * exception 1 in the GAP_MS block: beat 0 is the LOAD FRAME, so it must paint
 * on mount, on R and on an ArrowLeft back to 0 without a two-second stare at a
 * blank desk first.
 */
export const INSTANT_ENTRY_STEP_IDS = new Set<string>(["first-fire"]);

/**
 * How long a bespoke chip ("Open Pulse", "Open Office") shows its pressed state
 * when the script presses it for the actor.
 *
 * It sits INSIDE the pressing beat's entry sequence, between that beat's entry
 * hold and its patch: the previous frame holds, the chip depresses, and the
 * chip releases in the same update that opens the app. So the window arriving
 * reads as CAUSED by the button rather than as a cut. Skipped entirely when the
 * app is already open, which is what happens when the actor pressed the chip
 * themselves earlier in the take — the ad never double-presses.
 *
 * Presentation only: the pressed state is React state in AdModeShot, never
 * SceneState, so it is not part of any beat's folded result.
 */
export const CHIP_PRESS_MS = 300;

/**
 * WHICH BEAT PRESSES WHICH CHIP on the actor's behalf, keyed by step id.
 *
 * Two entries, one per bespoke chip, and they work identically: the named
 * beat's entry sequence depresses that chip between the entry hold and the
 * patch, and releases it in the SAME update that opens the app — so the window
 * arriving reads as CAUSED by the button. Both are skipped when the app is
 * already on the desk, which is exactly the case where the actor pressed the
 * chip themselves; the ad never presses a button twice.
 */
export const SCRIPTED_CHIP_PRESS: Record<string, FrontApp> = {
  // Priya's 9:14 line -> "Open Pulse" -> the dashboard, already red.
  stacking: "pulse",
  // Derek's "Do it." line -> "Open Office" -> the roster the wrong pick is
  // made on. Mirrors the Pulse chip exactly (see ChattrMessage.officeChip).
  "wrong-pick": "office",
};

/** This beat's entry hold: GAP_MS for every beat in the ad, and 0 for the load
 * frame. Every new beat is paced correctly by construction. */
export function entryHoldMs(step: Step): number {
  return INSTANT_ENTRY_STEP_IDS.has(step.id) ? 0 : GAP_MS;
}

/**
 * THE STEP EXCHANGE'S LEAD-IN: the gap from a beat's picture landing to the
 * first event of its exchange starting. GAP_MS like everything else — EXCEPT
 * when that first event's typing indicator would be OFF CAMERA, in which case
 * it is ZERO.
 *
 * WHY. The blanket rule spaces VISIBLE motions. The engine only renders the
 * typing indicator when its channel is the one on screen (same rule the live
 * app has), so an NPC line landing in a BACKGROUND thread has exactly one
 * visible motion — the message landing, with its banner and unread ring — and
 * starting its invisible indicator with the beat's patch costs the audience
 * nothing. Paying the gap first instead would put FOUR seconds of stillness
 * between the beat landing and its banner, which is the hole the flat rule
 * exists to prevent. So:
 *
 *   first event is an NPC line in the channel ON SCREEN  -> GAP_MS (the
 *     audience watches "X is typing…" appear, which is a motion of its own)
 *   first event is an NPC line in ANY OTHER channel      -> 0 (nothing to see
 *     until the message lands one GAP_MS later)
 *   first event is a player line, or a switch            -> GAP_MS (the player
 *     starting to type is visible, and a person reads before replying)
 *
 * DERIVED FROM THE SCRIPT, not the live scene: it folds the beats before this
 * one and asks what the patch does, so the answer is the same on every take,
 * on a retake, and in the timing trace — and an actor browsing channels between
 * beats cannot change the ad's pacing. Memoised, since it is a pure function of
 * SCRIPT.
 */
let stepLeadIns: number[] | null = null;

export function stepExchangeLeadInMs(index: number): number {
  if (!stepLeadIns) {
    const folded = completedTimeline(SCRIPT.length - 1);
    stepLeadIns = SCRIPT.map((step, i) => {
      const first = step.exchange?.[0];
      if (!first || first.kind !== "npc") return GAP_MS;
      const before = i === 0 ? INITIAL_SCENE : folded[i - 1];
      const onScreen = step.apply(before).activeChannel;
      return onScreen === first.channel ? GAP_MS : 0;
    });
  }
  return stepLeadIns[index] ?? GAP_MS;
}

/** Delay before the next character of a scripted player line. */
export function playerCharDelayMs(char: string, cfg: PlayerTypingConfig = PLAYER_TYPING): number {
  const span = Math.max(0, cfg.perCharMaxMs - cfg.perCharMinMs);
  const base = cfg.perCharMinMs + Math.random() * span;
  return Math.round(base + (PUNCTUATION.test(char) ? cfg.punctuationPauseMs : 0));
}

/** How long the real typing indicator holds before an NPC line lands: GAP_MS,
 * unless the line pins its own `indicatorMs` (see the flat-hold note above). */
export function npcIndicatorMs(line: { indicatorMs?: number }): number {
  return line.indicatorMs ?? GAP_MS;
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
  /** Document chip rendered under this line when it lands. */
  attachment?: MessageAttachment;
  /** Renders the "Open Office" chip under this line when it lands. Same
   * mechanism as the `pulseChip` seed carries for Priya's opening line, but on
   * a line that arrives DURING the take rather than one seeded as history. */
  officeChip?: true;
  /** Hard override of the computed indicator hold, in ms. Skips the formula. */
  indicatorMs?: number;
  /** Extra patch folded into the SAME update the message lands in (unread
   * marking, badge counts), so the indicator can never be on screen next to
   * the message it was announcing. */
  apply?: StatePatch;
  /** Banner fired the moment the message lands, after the indicator. */
  banner?: BannerSpec;
};

/**
 * A scripted CONVERSATION SWITCH: the open channel changes to `channel`, and
 * its unread ring clears, exactly as `read` does for a click.
 *
 * IT IS AN EXCHANGE EVENT, not a beat patch, and that is the whole point. The
 * ad's rule is that a switch is REACTIVE — nothing changes the thread on screen
 * until the reason to change it is already there — so the switch has to be able
 * to sit AFTER the line that motivates it, on the same two-second metronome as
 * everything else:
 *
 *   the beat lands (thread unchanged) -> the NPC line arrives in its own,
 *   off-screen thread: banner + unread ring -> GAP_MS -> THIS: the channel
 *   flips, the ring clears, and the message that was announced is revealed.
 *
 * On camera that reads as the player answering the notification. It also means
 * the audience is never shown a thread before the thing that sent them there.
 *
 * The engine plays it as one instantaneous state update between two ordinary
 * gaps, and the fold replays it in order, so a beat's completed state carries
 * the switched channel exactly as stepping through it does.
 */
export type SwitchEvent = {
  kind: "switch";
  channel: ChannelId;
};

export type ExchangeEvent = PlayerLine | NpcLine | SwitchEvent;

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
  attachment?: MessageAttachment,
  /** Bespoke chips this line renders under its body. Optional, and spread as
   * given, so a line without one is byte-identical to what it was before. */
  chips?: { pulseChip?: true; officeChip?: true },
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
      [channel]: [...existing, { id, agentId, sender, time, text, attachment, ...chips }],
    },
  };
}

/**
 * The engine's (and the fold's) one entry point for an exchange event: lands a
 * line in its channel, or performs a scripted channel switch.
 *
 * Pure, so it composes with an event's own `apply` inside one state update, and
 * so the fold can replay the very same events with every delay treated as zero.
 */
export function applyExchangeEvent(s: SceneState, event: ExchangeEvent): SceneState {
  // A switch moves the eye, not the thread: no message, just the channel and
  // its unread ring — the same thing `read` does when the actor clicks a DM.
  if (event.kind === "switch") return read(s, event.channel);
  const landed =
    event.kind === "player"
      ? say(s, event.channel, PLAYER_AGENT_ID, PLAYER_SENDER, event.time, event.text)
      : say(
          s,
          event.channel,
          event.agentId,
          event.sender,
          event.time,
          event.text,
          event.attachment,
          event.officeChip ? { officeChip: true } : undefined,
        );
  return event.apply ? event.apply(landed) : landed;
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

/* --------------------------------------------------------- the eval batch */

/**
 * The Day-2 document, in one place: the chip Derek attaches, the title on the
 * Docs window and the body ScriptedDocs renders all read from here, so the ad
 * cannot show a chip labelled one thing and a window titled another.
 *
 * EVAL_BATCH_TOTAL is the number the whole back half of the ad is built to
 * make legible, and now the number the ad ENDS on: it is the count line on the
 * doc and the length of the numbered list under it. Change it here and both
 * follow.
 */
export const EVAL_DOC_ID = "ai-eval-batch-listing-assistant";
export const EVAL_DOC_TITLE = "AI Eval Batch — Listing Assistant";
export const EVAL_BATCH_TOTAL = 30;

/** The batch's trace list, one row per eval. Thirty short, scannable rows: the
 * point on camera is that the list VISIBLY runs 1..30, so the rows are terse
 * and the numbering does the talking. Hardcoded for filming. */
export const EVAL_BATCH_ROWS: string[] = [
  "retro chrome toaster · seller pilot",
  "mid-century walnut side table",
  "road bike, 54cm frame",
  "film camera, untested",
  "wool overcoat, size M",
  "cast iron skillet, seasoned",
  "record player + 2 speakers",
  "kids' bunk bed, flat-pack",
  "espresso machine, descaled",
  "leather satchel, worn corners",
  "desk lamp, brass finish",
  "mountain bike, needs tune-up",
  "sewing machine, 1970s",
  "dining chairs, set of 4",
  "acoustic guitar, small ding",
  "patio umbrella, faded",
  "bookshelf speakers, pair",
  "vintage typewriter, sticky keys",
  "stand mixer, all attachments",
  "snowboard + bindings",
  "wingback armchair, reupholstered",
  "telescope, tripod included",
  "rice cooker, barely used",
  "denim jacket, distressed",
  "coffee table, glass top",
  "electric kettle, no box",
  "camping tent, 2-person",
  "turntable cartridge, spare",
  "office chair, adjustable",
  "ceramic planter, hairline crack",
];

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
        // The affordance the whole first act hangs off: it is on screen from
        // the LOAD FRAME, so "someone take a look" has something to press. The
        // actor can press it at any time, and the STACKING beat presses it on
        // camera if they don't (see PULSE_CHIP_PRESS_MS).
        pulseChip: true,
      },
    ],
    // Empty. #design-review carries no scripted content at all: the Day-2 half
    // of the ad is the eval batch now, not a design decision, so there is no
    // beat that reads or appends to this thread. The channel stays in the
    // sidebar because the real app has it; the thread stays seeded (as an empty
    // array) because `say` refuses to write to an unseeded channel.
    "design-review": [],
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
    // exists.
    //
    // ONE BANNER AT A TIME, ON THE BLANKET GAP. The three autos sit one GAP_MS
    // apart and every indicator hold is the flat GAP_MS, so the whole beat is a
    // metronome of visible motions two seconds apart:
    //
    //   0s  the beat lands: Pulse opens, already red at 9%
    //   2s  the climb: badge 3 -> 7, 9% -> 17% over 361 attempts
    //   4s  Priya's banner (her line lands in the same frame)
    //   6s  Raj's banner
    //   8s  Derek's banner, and the badge going to 12 with it
    //
    // Each banner therefore arrives, is read, and visibly PUSHES the previous
    // one down the stack (see Banners.tsx) before the next appears, instead of
    // three notifications materialising as one block. It is also exact: with
    // the length-scaled formula and its jitter gone, no take can show the
    // pile-up out of order or at a different rhythm. The indicator holds are
    // invisible anyway — Pulse is front and #incidents is the open channel —
    // but they are still real, so clicking Chattr mid-hold shows the indicator
    // like the live app.
    autos: [
      {
        delayMs: GAP_MS,
        apply: (s) => markUnread(setPulse({ ...s, chattrBadge: 7 }, 600, 17, 361), "incidents"),
        exchange: [
          {
            kind: "npc",
            channel: "dm-priya",
            agentId: "priya",
            sender: "Priya",
            time: "9:42 AM",
            text: "support queue is filling up with checkout complaints",
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
        delayMs: GAP_MS * 2,
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
        delayMs: GAP_MS * 3,
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
    //
    // REACTIVE SWITCH. The beat lands WITHOUT changing the thread on screen —
    // the camera stays in #incidents, where the last beat left it — because at
    // that moment there is nothing in Derek's DM to go and read. His question
    // arrives first, as a banner and an unread ring on a background thread, and
    // only THEN does the channel flip to reveal it (the `switch` event below).
    // The player is answering a notification, not anticipating one. Everything
    // after the switch plays in the now-visible thread with the ordinary gaps:
    // the player types his reply on camera, and Derek's sign-off lands with a
    // VISIBLE typing indicator, because by then his DM is the open channel.
    apply: (s) =>
      show({ ...s, day: 1, minutes: 605, chattrBadge: 0, unread: [] }, ["chattr", "pulse"], "chattr"),
    exchange: [
      {
        kind: "npc",
        channel: "dm-derek",
        agentId: "derek",
        sender: "Derek",
        time: "10:04 AM",
        text: "Can you let me know who is taking this?",
        // A background thread now, so it takes the unread ring the real sidebar
        // would give it — the ring the switch below then clears.
        apply: (s) => markUnread(s, "dm-derek"),
        banner: {
          agentId: "derek",
          sender: "Derek",
          preview: "Can you let me know who is taking this?",
        },
      },
      // The player answering the notification: the thread opens, the ring
      // clears, and the question that was just announced is on screen.
      { kind: "switch", channel: "dm-derek" },
      // Typed into the REAL composer, character by character, and sent through
      // the real Enter path — the same engine every other player line uses.
      {
        kind: "player",
        channel: "dm-derek",
        time: "10:05 AM",
        text: "Should I assign someone from engineering?",
      },
      // EVERY NPC LINE BANNERS NOW (director's policy, replacing this file's
      // old visible-channel rule: a line landing in the thread on screen used
      // to stay silent so a notification never announced a message the audience
      // was already watching arrive). The rule is gone — an NPC message is an
      // NPC message, and each one gets its banner.
      //
      // This line also carries the ad's second bespoke chip: "Open Office",
      // sitting under the very instruction that sends the player to the roster.
      // The WRONG PICK beat presses it on camera (SCRIPTED_CHIP_PRESS), and the
      // actor can press it themselves at any point after it lands.
      {
        kind: "npc",
        channel: "dm-derek",
        agentId: "derek",
        sender: "Derek",
        time: "10:06 AM",
        text: "Do it. I want an update before this hits #general.",
        officeChip: true,
        banner: {
          agentId: "derek",
          sender: "Derek",
          preview: "Do it. I want an update before this hits #general.",
        },
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
    // The beat plays ITSELF: `autoAssign` flips Theo's card to "Assigned ✓" one
    // GAP_MS in — the same UI a click leaves behind — and `onAssign` then lands
    // the consequence. Only Theo gets a reaction; the roster card next to the
    // button already says "Out today", which is the joke.
    //
    // THE CONSEQUENCE COMES FROM THEO, NOT FROM DEREK. Nobody narrates the
    // mistake: the assignment simply bounces back off an out-of-office
    // auto-reply, and the player is left to notice.
    //
    // ****  THE ONE PACING EXCEPTION IN THE AD  ****
    // It fires 400ms after the assignment lands — NOT the blanket GAP_MS — and,
    // uniquely in this script, with `indicatorMs: 0`, so there is no "Theo is
    // typing" hold at all. That pair of numbers is a CHARACTER POINT, not
    // pacing: an out-of-office auto-responder answers instantly, and the whole
    // joke is that the reply comes back faster than a person could possibly
    // have read the assignment. Stretch it to two seconds, or give it an
    // indicator, and Theo stops being a machine. RECOMMENDED TO KEEP. To drop
    // the carve-out and go fully flat instead: `delayMs: GAP_MS` here and
    // delete the `indicatorMs: 0` below.
    //
    // The banner is the only way it reads on camera (Office is front, and
    // Theo's DM is not the thread on screen), so it carries Theo's own sprite.
    //
    // The actor can still beat the script to it: clicking any Assign button
    // first claims the beat's one assignment and cancels the auto, and clicking
    // Theo runs this exact same reaction (see AdModeShot's assignClaimed).
    apply: (s) => show({ ...s, day: 1, minutes: 607 }, ["chattr", "office"], "office"),
    autoAssign: { person: "Theo", delayMs: GAP_MS },
    onAssign: {
      person: "Theo",
      // EXCEPTION (flagged above): an instant automated auto-responder.
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
    id: "course-correct",
    label: "COURSE CORRECT",
    // The fix, IMMEDIATELY. Theo's away-reply has just bounced the assignment
    // back, so the retry happens in the same breath rather than four hours
    // later: Office is still the front window, `assignedTo: null` clears Theo's
    // flipped card so the roster is live again, and the right pick follows on
    // the same desk the wrong one was made on.
    //
    // Chattr is behind Office on Derek's DM (still the open channel from the
    // WHO IS TAKING THIS exchange), so Derek's confirmation lands in a thread
    // the camera can already see — and it answers the promise the player made
    // him two minutes earlier.
    //
    // Symmetrical with WRONG PICK, and now on the blanket gap throughout: the
    // script assigns Raj itself one GAP_MS in, Derek's indicator appears one
    // GAP_MS after the card flips, and his line lands one GAP_MS after that —
    // unless the actor clicks an Assign button first, in which case that click
    // claims the beat's one assignment, the auto is cancelled, and clicking Raj
    // plays this same reaction.
    apply: (s) => show({ ...s, day: 1, minutes: 610, assignedTo: null }, ["chattr", "office"]),
    autoAssign: { person: "Raj", delayMs: GAP_MS },
    onAssign: {
      person: "Raj",
      delayMs: GAP_MS,
      exchange: [
        {
          kind: "npc",
          channel: "dm-derek",
          agentId: "derek",
          sender: "Derek",
          time: "10:10 AM",
          text: "Raj is on it. Good.",
          banner: { agentId: "derek", sender: "Derek", preview: "Raj is on it. Good." },
        },
      ],
    },
  },

  /* 5 */
  {
    id: "misread-1",
    label: "MISREAD 1 of 5",
    // 3.1% next to 407 attempts: the two confusable numbers, side by side.
    // Pulse front, Chattr staggered behind it.
    apply: (s) =>
      setPulse(show({ ...s, day: 1, minutes: 680 }, ["chattr", "pulse"]), 680, 3.1, 407, false),
  },

  /* 6 */
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

  /* 7 */
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

  /* 8 */
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

  /* 9 */
  {
    id: "misread-5",
    label: "MISREAD 5 of 5",
    // The correction lands in #incidents, directly under the line it corrects,
    // and #incidents is the thread on screen — so this is the one NPC line in
    // the ad whose indicator is actually VISIBLE while it holds. It is also the
    // longest line in the ad, and under the blanket rule it holds for exactly
    // the same GAP_MS as every other line rather than scaling with its length —
    // so the audience watches "Priya is typing…" for two seconds and then gets
    // the whole correction at once. It banners as well, like every other NPC
    // line now does.
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
        // Banners on every NPC line now, this one included — see the policy
        // note at beat 2. The preview is the correction's first sentence, which
        // is the beat of it that has to read at banner size.
        banner: {
          agentId: "priya",
          sender: "Priya",
          preview: "That's not the right metric. 400 is the total attempts, not failures.",
        },
      },
    ],
  },

  /* 10 */
  {
    id: "raj-root-cause",
    label: "RAJ ROOT CAUSE",
    // The engineer reports back, and the ad finally says WHAT was wrong. This
    // is the setup the recovery beat needs: without it the numbers just fall
    // on their own, which reads as the incident fixing itself.
    //
    // Chattr comes forward — the player's inbox, still on #incidents where the
    // correction landed — and Pulse is declared FIRST so it takes the other
    // half of the split: still showing the spike Raj is about to explain, and
    // already in place for the payoff beat that follows.
    //
    // REACTIVE SWITCH, and this is the beat that motivated the rule. It used to
    // cut straight to Raj's DM and then wait there, so the shot stared at a
    // nearly empty thread before anything arrived and the cut read as happening
    // before the conversation existed. Now his report LANDS first, in a
    // background thread, announced by its banner and an unread ring on his DM;
    // one GAP_MS later the channel flips and reveals it. Nothing moves the eye
    // to a thread before there is a reason to look at it.
    //
    // His indicator is off camera throughout (his DM is not the open channel
    // while he composes), so it starts with the beat's patch and the first
    // thing the audience sees is the message itself, one GAP_MS in.
    apply: (s) => show({ ...s, day: 1, minutes: 835 }, ["pulse", "chattr"], "chattr"),
    exchange: [
      {
        kind: "npc",
        channel: "dm-raj",
        agentId: "raj",
        sender: "Raj",
        time: "1:55 PM",
        text: "Confirmed. Apple Pay token validation is timing out on their end, not ours. We shipped a retry buffer to absorb it. Rate should settle in the next few minutes.",
        // A background thread now, so it rings his DM in the sidebar.
        apply: (s) => markUnread(s, "dm-raj"),
        // Banner, per the every-NPC-line policy. Previewed down to the finding
        // itself: the fix, not the paragraph explaining it. It is also the
        // reason the next event exists — the switch answers this notification.
        banner: {
          agentId: "raj",
          sender: "Raj",
          preview: "Confirmed. Apple Pay token validation is timing out on their end, not ours.",
        },
      },
      // The reveal: Raj's DM opens, its ring clears, and the report the banner
      // just announced is on screen to be read.
      { kind: "switch", channel: "dm-raj" },
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
    //
    // THE BEAT OPENS ON A HELD BREATH. Arriving straight from Raj's "should
    // settle in the next few minutes", an instant recovery would make the fix
    // look like a cut rather than a consequence — so the beat's first GAP_MS
    // sits on the UNCHANGED spike (17% / 468, red, "Incident active"), the
    // system still visibly hurting, before the walk starts. The three steps
    // then land one GAP_MS apart each, like every other pair of motions in the
    // ad: 0s at 17%, 2s at 12%, 4s at 6%, 6s back to baseline. Every number on
    // the way is a real recorded sample, so the sparkline still draws the true
    // hump; only the on-screen digits are eased (see ScriptedPulse's count-up,
    // a 500ms DURATION that runs inside each step and is not a gap).
    apply: (s) => setPulse(show({ ...s, day: 1, minutes: 850 }, ["chattr", "pulse"]), 850, 17, 468),
    autos: [
      { delayMs: GAP_MS, apply: (s) => setPulse(s, 860, 12, 468) },
      { delayMs: GAP_MS * 2, apply: (s) => setPulse(s, 870, 6, 468) },
      {
        delayMs: GAP_MS * 3,
        apply: (s) => setPulse(s, 880, DEMO_BASELINE_FAILURE_PCT, 468),
      },
    ],
  },

  /* 12 */
  {
    id: "reckoning",
    label: "RECKONING",
    // The day lands before it is graded. The beat ENTERS with no overlay at
    // all — the recovered desk, Pulse still on it at a green 97% — and holds
    // there one GAP_MS so the recovery gets a moment to be true before the
    // verdict slides over it. (The clock flip is part of the beat's landing,
    // so it still happens with the picture rather than on the keypress; the
    // scorecard is then the next motion, GAP_MS later.) The overlay arrives
    // through the
    // ordinary auto/session path, so ArrowRight mid-hold flushes it and
    // advances off the one press, and the FOLD counts the scorecard as part of
    // this beat's completed state (an auto is replayed by `completeStep`), the
    // same as it was when the patch set it at entry.
    apply: (s) => ({ ...s, day: 1, minutes: 1005 }),
    autos: [{ delayMs: GAP_MS, apply: (s) => ({ ...s, overlay: "scorecard" }) }],
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
    id: "derek-evals",
    label: "DEREK EVALS",
    // Day 2's ask, and the last thing the player is handed before the ad ends.
    // Chattr alone, centered — and, like every other NPC-driven switch in the
    // ad, REACTIVE: the beat lands on whatever thread Day 1 ended in (Raj's DM),
    // Derek's message arrives in the background with its banner and an unread
    // ring, and only then does the channel flip to reveal it. The workspace
    // does not pre-empt the message that is about to arrive in it.
    //
    // The line arrives with a REAL document chip under it —
    // MessageListView's own attachment markup, the same button the live thread
    // renders for a doc attachment. The switch is what puts that chip on
    // camera, which is what motivates the NEXT beat opening the document;
    // clicking it raises the scripted Docs window, and the next beat stages
    // that window regardless, so the take never depends on the actor hitting
    // the chip.
    //
    // `overlay: "none"` is what DISMISSES the Day 2 transition card the
    // previous beat put up — this is the first beat of Day 2 proper, so it owns
    // clearing it (the beat that used to do that was the deleted Maya
    // follow-up).
    apply: (s) => show({ ...s, minutes: 543, overlay: "none" }, ["chattr"]),
    exchange: [
      {
        kind: "npc",
        channel: "dm-derek",
        agentId: "derek",
        sender: "Derek",
        time: "9:03 AM",
        text: "Hey, here are the evals",
        attachment: { key: EVAL_DOC_ID, label: EVAL_DOC_TITLE },
        // Background thread on arrival, so it rings in the sidebar.
        apply: (s) => markUnread(s, "dm-derek"),
        banner: {
          agentId: "derek",
          sender: "Derek",
          preview: "Hey, here are the evals",
        },
      },
      // The reveal: Derek's DM opens on the message and its document chip —
      // the frame the closing beat's Docs window comes out of.
      { kind: "switch", channel: "dm-derek" },
    ],
  },

  /* 15 — THE LAST BEAT. The ad ends here. */
  {
    id: "evals-doc",
    label: "EVALS DOC (final)",
    // The document itself, in its own window, in front of the thread that sent
    // it — the real product's shape for an opened attachment (Desktop gives a
    // doc its OWN DesktopWindow, titled with the doc's title and carrying the
    // Docs FileText icon, rather than pushing it into the Docs app shell). Two
    // windows, so the desk lays them out SPLIT: Derek's thread on the left, the
    // batch he just sent on the right.
    //
    // THIS IS THE CLOSING FRAME (director's call: the ad used to run one beat
    // further, into a full-screen eval overlay reviewing "trace 3 of 30"; that
    // beat is deleted). Everything the closer has to say is in this shot, so
    // the whole point of the frame is the NUMBER: the count line and the
    // numbered list have to make "30" unmistakable in one glance, because that
    // is the last thing on camera.
    //
    // Playback COMPLETES here and holds: the auto-advance schedules nothing
    // after the final beat (see AdModeShot's scheduleAutoAdvance), so the take
    // rests on the open document until the operator resets. ArrowRight at this
    // beat still fast-forwards its entry hold, and then clamps.
    apply: (s) => show({ ...s, minutes: 545 }, ["chattr", "docs"], "docs"),
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
 * forward path, where a line lands through `applyExchangeEvent` instead.
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
 * THE BANNER POLICY, ENFORCED: every scripted NPC line carries a banner, and no
 * player line does.
 *
 * Asserted rather than trusted because the failure mode is silent on camera —
 * a message simply arrives with no notification, which looks like a dropped
 * banner rather than like a missing three lines of data. Walks every exchange
 * the script owns: step exchanges, `auto` exchanges and assign-reaction
 * exchanges. Called once at module load (below), so a bad line fails the take
 * at import time rather than mid-shoot.
 */
export function assertEveryNpcLineBanners(script: Step[] = SCRIPT): void {
  const check = (line: ExchangeEvent, where: string) => {
    if (line.kind === "npc" && !line.banner) {
      throw new Error(`ad-mode: NPC line "${line.text.slice(0, 40)}…" in ${where} has no banner`);
    }
    if (line.kind === "player" && "banner" in line && line.banner) {
      throw new Error(`ad-mode: player line in ${where} must not banner`);
    }
  };
  for (const step of script) {
    for (const line of step.exchange ?? []) check(line, `beat "${step.id}"`);
    for (const auto of step.autos ?? []) {
      for (const line of auto.exchange ?? []) check(line, `beat "${step.id}" auto +${auto.delayMs}ms`);
    }
    for (const line of step.onAssign?.exchange ?? []) check(line, `beat "${step.id}" onAssign`);
  }
}

assertEveryNpcLineBanners();

/**
 * The assignment half of a completed beat: the card is flipped, and the step's
 * reaction (if this is the person it answers) has fully landed.
 */
function completeAssign(s: SceneState, step: Step, person: string): SceneState {
  let next: SceneState = { ...s, assignedTo: person };
  const reaction = step.onAssign;
  if (!reaction || reaction.person !== person) return next;
  if (reaction.apply) next = reaction.apply(next);
  for (const event of reaction.exchange ?? []) next = applyExchangeEvent(next, event);
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
  for (const event of step.exchange ?? []) s = applyExchangeEvent(s, event);
  for (const auto of [...(step.autos ?? [])].sort((a, b) => a.delayMs - b.delayMs)) {
    if (auto.apply) s = auto.apply(s);
    for (const event of auto.exchange ?? []) s = applyExchangeEvent(s, event);
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
