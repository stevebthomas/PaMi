/**
 * C2 -> study-topic injection verification (deterministic layer). Proves that
 * injectAttributionStudyTopic + buildStudyAreas surface the Cat-4
 * "confirmed_vs_speculation" topic whenever an unverified attribution finding
 * exists, including the early-out case where the study-areas API returned
 * nothing (empty matched list). Run: tsx scripts/c2-study-injection.ts
 */
import {
  analyzeAttributions,
  injectAttributionStudyTopic,
  buildStudyAreas,
  CONFIRMED_VS_SPECULATION_TOPIC_KEY,
  type AttributionFinding,
} from "../src/lib/sim/scorecard";
import type { Evaluation, Message } from "../src/lib/sim/types";

let n = 0;
const mid = () => `msg-${++n}`;
function msg(p: Pick<Message, "channel" | "senderId" | "content" | "sentAtSimMinutes">): Message {
  return { id: mid(), createdAt: Date.now(), ...p };
}

let failures = 0;
function assert(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"} — ${label}`);
  if (!cond) failures++;
}

const has = (keys: string[]) => keys.includes(CONFIRMED_VS_SPECULATION_TOPIC_KEY);
const areasHave = (findings: AttributionFinding[], matched: string[]) =>
  buildStudyAreas(injectAttributionStudyTopic(matched, findings), []).some(
    (a) => a.topicKey === CONFIRMED_VS_SPECULATION_TOPIC_KEY
  );

// --- Build real findings via analyzeAttributions ---------------------------
// Case UNVERIFIED (never-spoke): player credits Priya, who never messaged them.
const playerToDerek = msg({ channel: "dm_derek", senderId: "player", content: "About 60 sellers affected. That's Priya's estimate.", sentAtSimMinutes: 600 });
const unverifiedEvals: Record<string, Evaluation> = {
  [playerToDerek.id]: {
    id: `eval-${playerToDerek.id}`,
    messageId: playerToDerek.id,
    eventId: "dm_derek",
    scores: { tone: 8, speed: 8, completeness: 8, strategicThinking: 8 },
    feedback: "Direct update.",
    claims: [{ claim: "~60 sellers affected", status: "GROUNDED", source: "", sourceQuoteValidated: false, attributedTo: "Priya" }],
  },
};
const unverifiedFindings = analyzeAttributions(unverifiedEvals, [playerToDerek]);
assert("analyzeAttributions yields an unverified finding", unverifiedFindings.length === 1 && unverifiedFindings[0].verdict !== "verified");

// Case VERIFIED: Priya actually stated the figure earlier.
const priyaFigure = msg({ channel: "incidents", senderId: "priya", content: "Roughly 60 sellers are on the old payout cadence.", sentAtSimMinutes: 582 });
const playerToDerek2 = msg({ channel: "dm_derek", senderId: "player", content: "About 60 sellers affected. That's Priya's estimate.", sentAtSimMinutes: 600 });
const verifiedEvals: Record<string, Evaluation> = {
  [playerToDerek2.id]: {
    id: `eval-${playerToDerek2.id}`,
    messageId: playerToDerek2.id,
    eventId: "dm_derek",
    scores: { tone: 8, speed: 8, completeness: 8, strategicThinking: 8 },
    feedback: "Direct update.",
    claims: [{ claim: "~60 sellers affected", status: "GROUNDED", source: "Roughly 60 sellers", sourceQuoteValidated: true, attributedTo: "Priya" }],
  },
};
const verifiedFindings = analyzeAttributions(verifiedEvals, [priyaFigure, playerToDerek2]);
assert("analyzeAttributions yields a verified finding", verifiedFindings.length === 1 && verifiedFindings[0].verdict === "verified");

// --- Injection behavior -----------------------------------------------------
// 1. Early-out case: study-areas API skipped (empty matched list) + unverified
//    finding -> topic MUST still surface.
assert("early-out: empty matched + unverified -> key injected", has(injectAttributionStudyTopic([], unverifiedFindings)));
assert("early-out: empty matched + unverified -> topic in built areas", areasHave(unverifiedFindings, []));

// 2. LLM returned other topics but not Cat-4 + unverified -> prepended, deduped once.
{
  const out = injectAttributionStudyTopic(["postmortems", "triage_discipline"], unverifiedFindings);
  assert("LLM picks without Cat-4: key prepended", out[0] === CONFIRMED_VS_SPECULATION_TOPIC_KEY && out.length === 3);
}

// 3. LLM already returned Cat-4 + unverified -> no duplicate.
{
  const out = injectAttributionStudyTopic([CONFIRMED_VS_SPECULATION_TOPIC_KEY, "postmortems"], unverifiedFindings);
  assert("LLM already picked Cat-4: no duplicate", out.filter((k) => k === CONFIRMED_VS_SPECULATION_TOPIC_KEY).length === 1);
}

// 4. Verified-only findings -> NO injection.
assert("verified-only: key NOT injected", !has(injectAttributionStudyTopic([], verifiedFindings)));
assert("verified-only: matched list passes through untouched", injectAttributionStudyTopic(["postmortems"], verifiedFindings).join() === "postmortems");

// 5. No findings at all -> NO injection.
assert("no findings: key NOT injected", !has(injectAttributionStudyTopic([], [])));

// 6. The injected key actually resolves to a curated resource entry (not a dead key).
{
  const areas = buildStudyAreas(injectAttributionStudyTopic([], unverifiedFindings), []);
  const entry = areas.find((a) => a.topicKey === CONFIRMED_VS_SPECULATION_TOPIC_KEY);
  assert("injected key resolves to a real resource entry with links", Boolean(entry && entry.resources.length > 0 && entry.reason));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
