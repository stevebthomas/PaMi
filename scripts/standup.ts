/**
 * Deterministic, self-contained exercise of the 9:00 standup participation
 * feature (see src/lib/sim/standup.ts, the `standup` fallback event in
 * day1-scenario.ts, and joinStandup/leaveStandup in simStore.ts).
 *
 * Drives the REAL exports (no server, no API key, no browser): the actual store
 * actions for the JOIN path, and the actual scripted `standup` event's
 * condition/contentFor/applyEffect for the SKIP path. Covers:
 *
 *   JOIN path:
 *     (1) joinStandup marks standupAttended and opens the overlay.
 *     (2) leaveStandup posts EXACTLY ONE #general summary and saves the notes
 *         doc; a second leaveStandup is a no-op (double-fire safe).
 *     (3) with standupAttended set, the 9:15 fallback digest is SUPPRESSED.
 *   SKIP path:
 *     (4) the `standup` event fires at 9:15 (condition true when not attended),
 *         its contentFor is the shared digest, and its applyEffect saves the doc.
 *     (5) applyEffect is idempotent (run twice -> one doc, upsert by id).
 *   CONTINUITY + one-source:
 *     (6) Priya's line adapts to the discussed ledger, in the digest, the call
 *         speaker lines, and the saved doc alike; the doc body is identical
 *         whichever path produced it.
 *
 * Run:  npx tsx scripts/standup.ts
 */
import { useSimStore } from "../src/store/simStore";
import { day1ScenarioEvents } from "../src/data/day1-scenario";
import {
  standupDigestContent,
  standupDocMarkdown,
  standupSpeakerLines,
  buildStandupDoc,
  STANDUP_DOC_ID,
  STANDUP_EXPIRE_MINUTES,
} from "../src/lib/sim/standup";
import { initialStateBag, type StateBag } from "../src/lib/sim/types";
import { recordTopicDiscussed, DISCUSSED_PRIYA_TICKET_SPIKE } from "../src/lib/sim/commitments";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

function baseState(overrides: Partial<StateBag> = {}): StateBag {
  return { ...initialStateBag, commitmentLedger: [], sessionDocs: {}, ...overrides };
}
function withPriyaSpikeDiscussed(state: StateBag): StateBag {
  return {
    ...state,
    commitmentLedger: recordTopicDiscussed(state.commitmentLedger, {
      agentId: "priya",
      topic: DISCUSSED_PRIYA_TICKET_SPIKE,
      channel: "dm_priya",
      atSimMinutes: 528,
      summary: "flagged the spike",
    }),
  };
}

const standupEvent = day1ScenarioEvents.find((e) => e.id === "standup");
if (!standupEvent) throw new Error("standup event missing");

function generalStandupSummaries() {
  return useSimStore
    .getState()
    .messages.filter((m) => m.channel === "general" && m.senderId === "system" && m.content.includes("**Daily Standup, 9:00 AM**"));
}

console.log("=== JOIN path (store actions) ===\n");
{
  // Fresh store, clock parked at 9:00, no prior standup messages.
  useSimStore.setState({
    clockMinutes: 540,
    messages: [],
    stateBag: baseState({ playerName: "Sam" }),
    standupCallOpen: false,
    unreadChannels: new Set(),
    activeChannel: "dm_derek",
  });

  useSimStore.getState().joinStandup();
  check("(1) joinStandup sets standupAttended", useSimStore.getState().stateBag.standupAttended === true);
  check("(1) joinStandup opens the overlay", useSimStore.getState().standupCallOpen === true);

  useSimStore.getState().leaveStandup();
  check("(2) leaveStandup closes the overlay", useSimStore.getState().standupCallOpen === false);
  check("(2) leaveStandup posts exactly one #general summary", generalStandupSummaries().length === 1);
  check("(2) summary carries the standup-notes attachment", generalStandupSummaries()[0].attachment?.docId === STANDUP_DOC_ID);
  check("(2) leaveStandup saved the notes doc", Boolean(useSimStore.getState().stateBag.sessionDocs[STANDUP_DOC_ID]));

  // Double-fire: a second Leave must not post again or re-save.
  useSimStore.getState().leaveStandup();
  check("(2) second leaveStandup is a no-op (still one summary)", generalStandupSummaries().length === 1);

  // (3) With standupAttended set, the 9:15 fallback digest is suppressed.
  const attendedState = useSimStore.getState().stateBag;
  check("(3) fallback digest SUPPRESSED when attended", standupEvent.condition!(attendedState) === false);

  // Continuity flows through the join-path summary: player discussed the spike.
  const summaryBody = generalStandupSummaries()[0].content;
  check("(6) join summary reflects the discussed ledger is N/A here (not discussed) -> default line", summaryBody.includes("Support queue's a little heavier than usual"));
}

console.log("\n=== SKIP path (scripted event) ===\n");
{
  const notAttended = baseState({ playerName: "Sam" });
  check("(4) fallback condition true when not attended", standupEvent.condition!(notAttended) === true);
  check("(4) fallback fires at 9:15", standupEvent.triggerTimeMinutes === STANDUP_EXPIRE_MINUTES && STANDUP_EXPIRE_MINUTES === 555);
  check("(4) fallback contentFor === shared digest", standupEvent.contentFor!(notAttended) === standupDigestContent(notAttended));

  const eff = standupEvent.applyEffect!(notAttended) as Partial<StateBag>;
  const docs = eff.sessionDocs as StateBag["sessionDocs"];
  check("(4) fallback applyEffect saves the notes doc", Boolean(docs[STANDUP_DOC_ID]));
  check("(4) saved doc has the right title", docs[STANDUP_DOC_ID].title === "Standup Notes, Day 1");

  // (5) Idempotent: applying to a state that already has the doc upserts to one.
  const afterOnce: StateBag = { ...notAttended, ...eff };
  const eff2 = standupEvent.applyEffect!(afterOnce) as Partial<StateBag>;
  const docs2 = eff2.sessionDocs as StateBag["sessionDocs"];
  check("(5) applyEffect idempotent (one doc key after second run)", Object.keys(docs2).length === 1);
}

console.log("\n=== Continuity + one-source ===\n");
{
  const undisc = baseState({ playerName: "Sam" });
  const disc = withPriyaSpikeDiscussed(baseState({ playerName: "Sam" }));

  check("(6) digest default line when spike NOT discussed", standupDigestContent(undisc).includes("Support queue's a little heavier than usual"));
  check("(6) digest 'flagged to Sam earlier' when discussed", standupDigestContent(disc).includes("Like I flagged to Sam earlier"));

  // Same conditioned Priya line in the CALL speaker lines...
  const priyaCallLine = standupSpeakerLines(disc).find((l) => l.agentId === "priya")!.text;
  check("(6) call speaker line matches the discussed variant", priyaCallLine.includes("Like I flagged to Sam earlier"));

  // ...and in the saved DOC, which is byte-identical whichever path built it.
  check("(6) doc reflects the discussed variant", standupDocMarkdown(disc).includes("Like I flagged to Sam earlier"));
  check(
    "(6) doc body identical between store builder and pure builder",
    buildStandupDoc(disc).markdown === standupDocMarkdown(disc)
  );

  // Raj's and Design's lines are verbatim across variants.
  const undiscDigest = standupDigestContent(undisc);
  const discDigest = standupDigestContent(disc);
  check("(6) Raj line identical across variants", undiscDigest.includes("Jordan and Chen are mid-sprint") && discDigest.includes("Jordan and Chen are mid-sprint"));
  check("(6) Design line identical across variants", undiscDigest.includes("listing page wireframes") && discDigest.includes("listing page wireframes"));

  // Plain-JSON round-trip for the doc map (persistence safety).
  const map = { [STANDUP_DOC_ID]: buildStandupDoc(disc) };
  check("(6) sessionDocs entry is plain-JSON round-trippable", JSON.stringify(JSON.parse(JSON.stringify(map))) === JSON.stringify(map));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
