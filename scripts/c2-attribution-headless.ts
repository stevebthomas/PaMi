/**
 * C2 headless verification (deterministic layer). Drives the real
 * computeScorecard / analyzeAttributions from scorecard.ts with constructed
 * claims ledgers, so the tiered attribution check + scoring signal are proven
 * without a model call. Run: tsx scripts/c2-attribution-headless.ts
 */
import { computeScorecard, analyzeAttributions } from "../src/lib/sim/scorecard";
import { initialStateBag } from "../src/lib/sim/types";
import type { Evaluation, Message, StateBag } from "../src/lib/sim/types";

let n = 0;
const mid = () => `msg-${++n}`;

function msg(partial: Partial<Message> & Pick<Message, "channel" | "senderId" | "content" | "sentAtSimMinutes">): Message {
  return { id: mid(), createdAt: Date.now(), ...partial };
}

// A shared base state: postmortem submitted, no escalation, so stakeholderMgmt
// has a clean, penalty-free base and the ONLY mover across cases is attribution.
const baseState: StateBag = { ...initialStateBag, postmortemSubmitted: true, respondedAtMinutes: { "derek-escalation": 600 } };

function derekEval(messageId: string, claims?: Evaluation["claims"]): Evaluation {
  return {
    id: `eval-${messageId}`,
    messageId,
    eventId: "dm_derek",
    scores: { tone: 8, speed: 8, completeness: 8, strategicThinking: 8 },
    feedback: "Solid, direct update.",
    ...(claims ? { claims } : {}),
  };
}

function run(label: string, messages: Message[], evaluations: Record<string, Evaluation>) {
  console.log(`\n===== ${label} =====`);
  const findings = analyzeAttributions(evaluations, messages);
  console.log("attribution findings:", JSON.stringify(findings, null, 2));
  const { scores, coachingNotes } = computeScorecard(evaluations, baseState, messages, 700, []);
  console.log("stakeholderMgmt:", scores.stakeholderMgmt);
  const notes = coachingNotes.filter((c) => c.label === "Attribution accuracy");
  console.log("attribution notes:", notes.map((c) => c.feedback));
}

// -- Case (a): Priya actually stated the ~60 figure, player credits Priya -> verified, no penalty.
{
  const priyaEscalation = msg({ channel: "incidents", senderId: "priya", content: "Apple Pay checkout is failing, 14 tickets in the last hour.", sentAtSimMinutes: 555 });
  const priyaFigure = msg({ channel: "incidents", senderId: "priya", content: "Roughly 60 sellers are on the old payout cadence after the rollback.", sentAtSimMinutes: 582 });
  const playerToDerek = msg({ channel: "dm_derek", senderId: "player", content: "About 60 sellers affected. That's Priya's estimate.", sentAtSimMinutes: 600 });
  const evals = {
    [playerToDerek.id]: derekEval(playerToDerek.id, [
      { claim: "~60 sellers affected by the payout delay", status: "GROUNDED", source: "Roughly 60 sellers are on the old payout cadence", sourceQuoteValidated: true, attributedTo: "Priya" },
    ]),
  };
  run("(a) verified attribution — Priya really said 60", [priyaEscalation, priyaFigure, playerToDerek], evals);
}

// -- Case (b): Priya never stated 60, player credits Priya -> plausible (Tier 2), -1.0 + note.
{
  const priyaEscalation = msg({ channel: "incidents", senderId: "priya", content: "Apple Pay checkout is failing, 14 tickets in the last hour.", sentAtSimMinutes: 555 });
  const playerToDerek = msg({ channel: "dm_derek", senderId: "player", content: "About 60 sellers affected. That's Priya's estimate.", sentAtSimMinutes: 600 });
  const evals = {
    [playerToDerek.id]: derekEval(playerToDerek.id, [
      { claim: "~60 sellers affected by the payout delay", status: "UNSOURCED", source: "player never got this figure from an NPC", sourceQuoteValidated: false, attributedTo: "Priya" },
    ]),
  };
  run("(b) unverified attribution — Priya never said 60 (but she spoke)", [priyaEscalation, playerToDerek], evals);
}

// -- Case (c): no attribution at all -> nothing fires, score equals baseline.
{
  const priyaEscalation = msg({ channel: "incidents", senderId: "priya", content: "Apple Pay checkout is failing, 14 tickets in the last hour.", sentAtSimMinutes: 555 });
  const playerToDerek = msg({ channel: "dm_derek", senderId: "player", content: "About 60 sellers affected, still confirming.", sentAtSimMinutes: 600 });
  const evals = {
    [playerToDerek.id]: derekEval(playerToDerek.id, [
      { claim: "~60 sellers affected by the payout delay", status: "UNSOURCED", source: "no NPC supplied this", sourceQuoteValidated: false },
    ]),
  };
  run("(c) no attribution — nothing fires", [priyaEscalation, playerToDerek], evals);
}

// -- Case (d): player credits someone they never spoke to -> never-spoke (Tier 3), -1.5.
{
  const priyaEscalation = msg({ channel: "incidents", senderId: "priya", content: "Apple Pay checkout is failing, 14 tickets in the last hour.", sentAtSimMinutes: 555 });
  const playerToDerek = msg({ channel: "dm_derek", senderId: "player", content: "Maya said it's about 60 sellers.", sentAtSimMinutes: 600 });
  const evals = {
    [playerToDerek.id]: derekEval(playerToDerek.id, [
      { claim: "~60 sellers affected", status: "UNSOURCED", source: "Maya never messaged the player", sourceQuoteValidated: false, attributedTo: "Maya" },
    ]),
  };
  run("(d) never-spoke attribution — Maya never messaged the player", [priyaEscalation, playerToDerek], evals);
}
