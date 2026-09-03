/**
 * Deterministic, self-contained exercise of the A2 obligation engine for Maya's
 * end-of-day design-call follow-up (ObligationKind "maya-design-followup"). Drives
 * the REAL engine functions from src/lib/sim/obligations.ts (no reimplementation,
 * no server, no API key): seedMayaDesignFollowUp to seed the obligation exactly as
 * maya-design-question's applyEffect does, then evaluateObligations across a rising
 * sim clock, asserting the three cases the subtask calls for:
 *
 *   (a) no response            -> fires exactly once, at/after 5:00 PM (1020)
 *   (b) response at 2:00 PM     -> never fires (cancelWhen settles it silently)
 *   (c) double advanceClock     -> fires once, re-entrant-safe (second pass no-op)
 *
 * obligations.ts imports ONLY from ./types, so this script imports it directly by
 * relative path with no path-alias/tooling setup. Run:  tsx scripts/maya-followup-engine.ts
 */
import {
  seedMayaDesignFollowUp,
  evaluateObligations,
  MAYA_DESIGN_FOLLOWUP_AT_MINUTES,
  type ObligationInputs,
} from "../src/lib/sim/obligations";
import type { ObligationEntry } from "../src/lib/sim/types";

const MAYA_ASK_MINUTES = 750; // 12:30 PM, maya-design-question's triggerTimeMinutes.

/** ObligationInputs with only the fields this obligation reads set to live
 * values; the incident-derived fields are irrelevant to it and stay null. */
function inputs(clockMinutes: number, mayaRespondedAt: number | null): ObligationInputs {
  return {
    clockMinutes,
    landedAtMinutes: null,
    fullyRecoveredAtMinutes: null,
    incidentDeclaredAtMinutes: null,
    decidedAtMinutes: null,
    resolutionAnnouncedAtMinutes: null,
    csTemplateAttemptedAtMinutes: null,
    mayaDesignRespondedAtMinutes: mayaRespondedAt,
  };
}

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}

/** Advance a clock in steps, running the engine each tick, accumulating every
 * maya-design-followup firing. Mirrors advanceClock's per-tick evaluate loop. */
function runClock(
  seed: ObligationEntry[],
  ticks: number[],
  mayaRespondedAt: number | null
): { firings: number[]; obligations: ObligationEntry[] } {
  let obligations = seed;
  const firings: number[] = [];
  for (const clock of ticks) {
    const res = evaluateObligations(obligations, inputs(clock, mayaRespondedAt));
    obligations = res.nextObligations;
    for (const f of res.firings) {
      if (f.kind === "maya-design-followup") firings.push(f.sentAtSimMinutes);
    }
  }
  return { firings, obligations };
}

console.log(`MAYA_DESIGN_FOLLOWUP_AT_MINUTES = ${MAYA_DESIGN_FOLLOWUP_AT_MINUTES} (5:00 PM)\n`);

// Seed idempotency: seeding twice yields exactly one entry (stable id dedupe).
const seededOnce = seedMayaDesignFollowUp([], MAYA_ASK_MINUTES);
const seededTwice = seedMayaDesignFollowUp(seededOnce, MAYA_ASK_MINUTES);
check("seed is idempotent (one entry after double-seed)", seededTwice.length === 1);
check(
  "seeded entry is plain-JSON round-trippable",
  JSON.stringify(JSON.parse(JSON.stringify(seededTwice))) === JSON.stringify(seededTwice)
);

// (a) No response: clock rises across the day in 15-min ticks. Must fire once,
// stamped at exactly 1020 (5:00 PM), and not before.
{
  const ticks: number[] = [];
  for (let m = MAYA_ASK_MINUTES; m <= 1080; m += 15) ticks.push(m);
  const { firings, obligations } = runClock(seedMayaDesignFollowUp([], MAYA_ASK_MINUTES), ticks, null);
  check("(a) no response: fires exactly once", firings.length === 1);
  check(`(a) fires at/after 5:00 PM (stamped ${firings[0]})`, firings[0] === MAYA_DESIGN_FOLLOWUP_AT_MINUTES);
  const preWindow = runClock(seedMayaDesignFollowUp([], MAYA_ASK_MINUTES), [1005, 1019], null);
  check("(a) does NOT fire before 5:00 PM", preWindow.firings.length === 0);
  check("(a) entry ends fulfilled", obligations[0].status === "fulfilled");
}

// (b) Response at 2:00 PM (840), i.e. between 12:30 and 5:00 PM. Must NEVER fire;
// the cancelWhen settles it silently (status -> cancelled).
{
  const ticks: number[] = [];
  for (let m = MAYA_ASK_MINUTES; m <= 1080; m += 15) ticks.push(m);
  const { firings, obligations } = runClock(seedMayaDesignFollowUp([], MAYA_ASK_MINUTES), ticks, 840);
  check("(b) response at 2:00 PM: never fires", firings.length === 0);
  check("(b) entry settled silently (cancelled)", obligations[0].status === "cancelled");
}

// (b') Response exactly at the trigger minute (1020): tie goes to cancel (the
// player answered, so no cold nudge).
{
  const { firings, obligations } = runClock(seedMayaDesignFollowUp([], MAYA_ASK_MINUTES), [1020], 1020);
  check("(b') response at exactly 5:00 PM: never fires (tie -> cancel)", firings.length === 0);
  check("(b') entry cancelled at the tie", obligations[0].status === "cancelled");
}

// (c) Double advanceClock past the window with no response: fires exactly once.
// The second pass sees a "fulfilled" (no longer pending) entry and is a no-op.
{
  let obligations = seedMayaDesignFollowUp([], MAYA_ASK_MINUTES);
  const pass1 = evaluateObligations(obligations, inputs(1020, null));
  obligations = pass1.nextObligations;
  const pass2 = evaluateObligations(obligations, inputs(1035, null));
  obligations = pass2.nextObligations;
  const total =
    pass1.firings.filter((f) => f.kind === "maya-design-followup").length +
    pass2.firings.filter((f) => f.kind === "maya-design-followup").length;
  check("(c) double advanceClock: fires once total", total === 1);
  check("(c) second pass is a no-op (changed === false)", pass2.changed === false);
  check("(c) entry remains fulfilled after re-entry", obligations[0].status === "fulfilled");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
