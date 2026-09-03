/**
 * Deterministic, self-contained exercise of the DISCUSSED-LEDGER re-explain fix
 * (see the "topic-discussed" CommitmentKind in types.ts, recordTopicDiscussed /
 * hasDiscussed in commitments.ts, and the state-aware contentFor on the
 * raj-tradeoff-offer and standup scripted beats in day1-scenario.ts).
 *
 * Drives the REAL exports (no reimplementation, no server, no API key): the
 * actual scripted events' contentFor closures and the actual ledger helpers.
 * Covers exactly the cases the subtask calls for:
 *
 *   Raj 9:38 offer:
 *     (1) DM decision already made -> per-choice STATUS variant (both choices),
 *         never the re-ask.
 *     (2) no DM discussion, no decision -> FULL first-contact offer verbatim.
 *     (3) options discussed but no decision classified -> "we've been going back
 *         and forth" variant, NOT the cold re-ask (the confirmed repro's residual
 *         case).
 *   Standup 9:00 digest:
 *     (4) player has NOT discussed the spike with Priya -> default line verbatim.
 *     (5) player HAS discussed it (+ player name) -> "like I flagged to <name>
 *         earlier" line; and the name-less fallback.
 *   Mechanism:
 *     (6) recordTopicDiscussed idempotency / re-entrancy (double-record = one
 *         entry), hasDiscussed read side, plain-JSON round-trip.
 *
 * commitments.ts imports ONLY from ./types; day1-scenario.ts is import-cycle-safe
 * and pulls no browser globals, so both import directly by relative path with no
 * tooling setup. Run:  tsx scripts/discussed-ledger.ts
 */
import { day1ScenarioEvents } from "../src/data/day1-scenario";
import {
  recordTopicDiscussed,
  hasDiscussed,
  DISCUSSED_RAJ_INCIDENT_OPTIONS,
  DISCUSSED_PRIYA_TICKET_SPIKE,
} from "../src/lib/sim/commitments";
import { initialStateBag, type StateBag } from "../src/lib/sim/types";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

function contentForOf(id: string): (state: StateBag) => string {
  const evt = day1ScenarioEvents.find((e) => e.id === id);
  if (!evt || !evt.contentFor) throw new Error(`event ${id} has no contentFor`);
  return evt.contentFor;
}

/** A fresh base StateBag with the incident knowable but no decision/ledger. */
function baseState(overrides: Partial<StateBag> = {}): StateBag {
  return { ...initialStateBag, commitmentLedger: [], ...overrides };
}

/** Record that Raj has been over the fix options with the player, exactly as
 * the store's tradeoffEngagedWithRajAtMinutes transition does. */
function withRajOptionsDiscussed(state: StateBag, atMinutes = 558): StateBag {
  return {
    ...state,
    commitmentLedger: recordTopicDiscussed(state.commitmentLedger, {
      agentId: "raj",
      topic: DISCUSSED_RAJ_INCIDENT_OPTIONS,
      channel: "dm_raj",
      atSimMinutes: atMinutes,
      summary: "back and forth on the fix",
    }),
  };
}

/** Record that Priya has flagged the ticket spike to the player, exactly as the
 * store's priya-heads-up-dm satisfaction transition does. */
function withPriyaSpikeDiscussed(state: StateBag, atMinutes = 528): StateBag {
  return {
    ...state,
    commitmentLedger: recordTopicDiscussed(state.commitmentLedger, {
      agentId: "priya",
      topic: DISCUSSED_PRIYA_TICKET_SPIKE,
      channel: "dm_priya",
      atSimMinutes: atMinutes,
      summary: "flagged the spike",
    }),
  };
}

const rajOffer = contentForOf("raj-tradeoff-offer");
const standup = contentForOf("standup");

const RE_ASK = "Which way do you want to go?";

console.log("=== Raj 9:38 #incidents offer ===\n");

// (1) DM decision already made -> per-choice STATUS variant, never the re-ask.
{
  const rollback = rajOffer(baseState({ tradeoffChoice: "rollback" }));
  check("(1a) rollback decided -> rolling-back status variant", /rolling back/i.test(rollback));
  check("(1a) rollback decided -> NOT the re-ask", !rollback.includes(RE_ASK));

  const patch = rajOffer(baseState({ tradeoffChoice: "patch-forward" }));
  check("(1b) patch decided -> patch-forward status variant", /patch-forward/i.test(patch) && /keeping payout speed/i.test(patch));
  check("(1b) patch decided -> NOT the re-ask", !patch.includes(RE_ASK));

  // A decision on the record wins even if options were also flagged as discussed
  // (both entries can coexist on a single decisive message).
  const both = rajOffer(withRajOptionsDiscussed(baseState({ tradeoffChoice: "patch-forward" })));
  check("(1c) decided + discussed -> still the decided status variant", /patch-forward/i.test(both) && !both.includes(RE_ASK));
}

// (2) No DM discussion, no decision -> FULL first-contact offer verbatim.
{
  const full = rajOffer(baseState());
  check("(2) undiscussed + undecided -> full first-contact offer (has the re-ask)", full.includes(RE_ASK));
  check("(2) full offer opens with the first-contact framing", full.startsWith("Ok, two ways to fix this"));
}

// (3) Options discussed but no decision classified -> reference-the-thread
// variant, NOT the cold re-ask. This is the confirmed repro's residual case
// (a DM call the tradeoff classifier read as "unclear" leaves tradeoffChoice
// null, but the player has demonstrably been over the options with Raj).
{
  const discussed = rajOffer(withRajOptionsDiscussed(baseState()));
  check("(3) discussed + undecided -> NOT the cold re-ask", !discussed.includes(RE_ASK));
  check("(3) discussed + undecided -> references the ongoing thread", /going back and forth/i.test(discussed));
  check("(3) discussed variant still surfaces both paths", /rollback/i.test(discussed) && /patch-forward/i.test(discussed));
  check("(3) discussed variant does NOT re-open with first-contact framing", !discussed.startsWith("Ok, two ways to fix this"));
}

console.log("\n=== Standup 9:00 digest ===\n");

// (4) Not discussed with Priya -> default line verbatim.
{
  const digest = standup(baseState({ playerName: "Sam" }));
  check("(4) spike NOT discussed -> default Priya line", digest.includes("Support queue's a little heavier than usual"));
  check("(4) spike NOT discussed -> no 'flagged ... earlier' framing", !/flagged to .* earlier/i.test(digest));
}

// (5) Discussed with Priya -> "like I flagged to <name> earlier"; name-less
// fallback when no player name was entered.
{
  const named = standup(withPriyaSpikeDiscussed(baseState({ playerName: "Sam" })));
  check("(5a) spike discussed + name -> 'Like I flagged to Sam earlier'", named.includes("Like I flagged to Sam earlier"));
  check("(5a) discussed variant drops the brand-new default line", !named.includes("Support queue's a little heavier than usual"));

  const noName = standup(withPriyaSpikeDiscussed(baseState({ playerName: "" })));
  check("(5b) spike discussed + no name -> 'the new PM' fallback", noName.includes("Like I flagged to the new PM earlier"));

  // Raj's and Design's standup lines are unchanged across both variants.
  const def = standup(baseState());
  check("(5c) Raj's standup line identical across variants", def.includes("Jordan and Chen are mid-sprint") && named.includes("Jordan and Chen are mid-sprint"));
  check("(5c) Design's standup line identical across variants", def.includes("listing page wireframes") && named.includes("listing page wireframes"));
}

console.log("\n=== Ledger mechanism (idempotency / re-entrancy / JSON) ===\n");

// (6) recordTopicDiscussed is idempotent by stable id: a re-entrant advanceClock
// or a re-satisfied event can't double-append.
{
  const once = recordTopicDiscussed([], {
    agentId: "priya",
    topic: DISCUSSED_PRIYA_TICKET_SPIKE,
    channel: "dm_priya",
    atSimMinutes: 528,
    summary: "flagged the spike",
  });
  const twice = recordTopicDiscussed(once, {
    agentId: "priya",
    topic: DISCUSSED_PRIYA_TICKET_SPIKE,
    channel: "dm_priya",
    atSimMinutes: 999, // different minute: dedup is by identity, not by content
    summary: "flagged the spike again",
  });
  check("(6a) double-record -> exactly one entry", twice.length === 1);
  check("(6a) second record is a no-op (same array reference)", once === twice);
  check("(6b) hasDiscussed true for recorded (agent, topic)", hasDiscussed(twice, "priya", DISCUSSED_PRIYA_TICKET_SPIKE));
  check("(6b) hasDiscussed false for a different agent", !hasDiscussed(twice, "raj", DISCUSSED_PRIYA_TICKET_SPIKE));
  check("(6b) hasDiscussed false for a different topic", !hasDiscussed(twice, "priya", DISCUSSED_RAJ_INCIDENT_OPTIONS));
  check("(6b) hasDiscussed tolerates empty/undefined ledger", !hasDiscussed([], "priya", DISCUSSED_PRIYA_TICKET_SPIKE) && !hasDiscussed(undefined, "priya", DISCUSSED_PRIYA_TICKET_SPIKE));
  check(
    "(6c) entry is plain-JSON round-trippable",
    JSON.stringify(JSON.parse(JSON.stringify(twice))) === JSON.stringify(twice)
  );
  check("(6c) entry is born settled", twice[0].status === "settled");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
