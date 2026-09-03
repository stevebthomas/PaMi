/**
 * SINGLE SOURCE for the Day-1 9:00 AM standup content.
 *
 * The same continuity-conditioned lines feed THREE surfaces so they can never
 * drift:
 *   1. the call-screen overlay's sequential speaker lines (standupSpeakerLines),
 *   2. the #general digest / summary message (standupDigestContent), used by the
 *      scripted `standup` event's contentFor AND by the join-path summary the
 *      store posts on Leave, and
 *   3. the "Standup Notes, Day 1" doc saved into the Docs app in BOTH paths
 *      (buildStandupDoc).
 *
 * Only Priya's line varies: if the player already worked the checkout ticket
 * spike with her in DM before standup (discussed ledger:
 * DISCUSSED_PRIYA_TICKET_SPIKE), her line builds on that conversation instead of
 * presenting the spike as brand-new. Raj's and Design's lines are verbatim in
 * every variant (see the audit note in day1-scenario.ts's `standup` event).
 *
 * DEPENDENCY DISCIPLINE: imports ONLY from ./types and ./commitments (both of
 * which import only ./types). day1-scenario.ts consumes this module and sits at
 * the bottom of a real init cycle (worldCanon -> incidentTimeline ->
 * day1-scenario); pulling in anything heavier here would close that cycle, so
 * this file stays a leaf, exactly like commitments.ts. The SessionDoc shape is
 * a plain-JSON type from ./types, so buildStandupDoc's output round-trips
 * through the persistence layer untouched.
 */
import { initialStateBag, type AgentId, type SessionDoc, type StateBag } from "./types";
import { hasDiscussed, DISCUSSED_PRIYA_TICKET_SPIKE } from "./commitments";

/** Sim-clock minute the standup call opens and the Join affordance appears. */
export const STANDUP_START_MINUTES = 540; // 9:00 AM
/** Sim-clock minute the Join affordance expires and the fallback digest posts to
 * #general on the non-join path (see the `standup` event in day1-scenario.ts). */
export const STANDUP_EXPIRE_MINUTES = 555; // 9:15 AM

/** Identity of the session-generated "Standup Notes" doc. Stable id so the save
 * is idempotent (upsert by this key) across both paths and re-entrant fires. */
export const STANDUP_DOC_ID = "standup-notes-day-1";
export const STANDUP_DOC_TITLE = "Standup Notes, Day 1";
export const STANDUP_DOC_FILENAME = "Standup Notes, Day 1.md";

// --- Raw line text (moved here from day1-scenario.ts so this module is the one
// place the wording lives). Kept as plain sentences; the markdown wrappers below
// (`**Speaker:** "..."` for the digest, `- **Speaker:** ...` for the doc) are
// applied by the renderers so the call screen can present the same text without
// the markdown noise. ---
const RAJ_TEXT =
  "Jordan and Chen are mid-sprint on the checkout redesign, no blockers there. Rest of the team's heads-down on their own stuff. I want eyes on payment service tech debt soon.";
const DESIGN_TEXT =
  "Heads-down on the listing page wireframes this morning, will post something in #design-review around midday.";
const PRIYA_TEXT_DEFAULT =
  "Support queue's a little heavier than usual this morning, mostly checkout-related. Keeping an eye on it.";
const TAIL = "*Nothing here is flagged urgent, but you've already heard from Priya once this morning.*";

/** Priya's continuity-conditioned standup line. Un-discussed variant is verbatim
 * the old default; the discussed variant references the earlier DM by player
 * name (falling back to "the new PM" when no name was entered). */
function priyaLineText(state: StateBag): string {
  if (!hasDiscussed(state.commitmentLedger, "priya", DISCUSSED_PRIYA_TICKET_SPIKE)) {
    return PRIYA_TEXT_DEFAULT;
  }
  const name = typeof state.playerName === "string" ? state.playerName.trim() : "";
  const who = name || "the new PM";
  return `Like I flagged to ${who} earlier, the support queue's heavier than usual this morning, mostly checkout-related. Still keeping an eye on it.`;
}

/** One speaker's standup line, for the call-screen overlay. `agentId` selects
 * the PixelAvatar; `speaker` is the label shown ("Design" is a proxy for Maya,
 * matching the digest's own label). */
export interface StandupSpeakerLine {
  agentId: AgentId;
  speaker: string;
  text: string;
}

/** The sequential speaker lines, in order, for the call screen. The ONE source
 * the digest and doc are also derived from, so all three surfaces agree. */
export function standupSpeakerLines(state: StateBag): StandupSpeakerLine[] {
  return [
    { agentId: "raj", speaker: "Raj", text: RAJ_TEXT },
    { agentId: "priya", speaker: "Priya", text: priyaLineText(state) },
    { agentId: "maya", speaker: "Design", text: DESIGN_TEXT },
  ];
}

/** AgentIds present at the standup (for the attendee avatar row), the player
 * aside. Raj, Priya, and Maya (Design), matching the speaker lines. */
export const STANDUP_ATTENDEE_IDS: AgentId[] = ["raj", "priya", "maya"];

/** The #general digest / summary markdown: the continuity-conditioned standup,
 * rendered as `**Speaker:** "line"`. Consumed by the scripted `standup` event's
 * contentFor (non-join fallback) AND the join-path summary the store posts on
 * Leave, so both paths render byte-identical bodies from this one function. */
export function standupDigestContent(state: StateBag): string {
  const lines = standupSpeakerLines(state)
    .map((l) => `**${l.speaker}:** "${l.text}"`)
    .join("\n");
  return `**Daily Standup, 9:00 AM**\n\n${lines}\n\n${TAIL}`;
}

/** Default (nothing-discussed) digest, used as the scripted event's static
 * `content` fallback for consumers that don't call contentFor (the headless
 * playtest mirror). Reads as a sensible standalone line, as ScenarioEvent
 * requires. Computed once from the initial state bag. */
export const STANDUP_DIGEST_DEFAULT = standupDigestContent(initialStateBag);

/** The "Standup Notes, Day 1" doc body, rendered in the DocWindow markdown
 * subset (heading, italic subtitle, hr, bullet list, bold). Same conditioned
 * lines as the digest, so the saved notes match what was said. */
export function standupDocMarkdown(state: StateBag): string {
  const bullets = standupSpeakerLines(state)
    .map((l) => `- **${l.speaker}:** ${l.text}`)
    .join("\n");
  return `# Standup Notes — Day 1

*Daily standup, 9:00 AM*

---

${bullets}

---

${TAIL}
`;
}

/** Build the session doc record for the standup notes (SessionDoc = plain-JSON,
 * SimDoc-shaped). Idempotent to save: same STANDUP_DOC_ID every time, so an
 * upsert into stateBag.sessionDocs de-dupes across both paths and re-fires. */
export function buildStandupDoc(state: StateBag): SessionDoc {
  return {
    id: STANDUP_DOC_ID,
    title: STANDUP_DOC_TITLE,
    filename: STANDUP_DOC_FILENAME,
    markdown: standupDocMarkdown(state),
  };
}
