/**
 * Headless verification for DayOutcome (see src/lib/sim/dayOutcome.ts /
 * src/lib/sim/types.ts). Drives the REAL sim store (src/store/simStore.ts),
 * not a reimplementation, against the app's real API routes on a running
 * dev/prod server, same production code paths scripts/playtest.ts uses.
 *
 * Requires the app's dev server running at TEST_BASE_URL (default
 * http://localhost:3000) and a valid ANTHROPIC_API_KEY.
 *
 * Run with:
 *   tsx scripts/test-day-outcome.ts --run=a   (engaged: rollback + Marcus + postmortem)
 *   tsx scripts/test-day-outcome.ts --run=b   (disengaged: Raj falls back, forced end of day)
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

loadDotEnvLocal();

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

// Every fetch call inside simStore.ts uses a bare relative path (e.g.
// "/api/agents/reply") because it's written to run in a browser. Rewrite
// those to the real dev server before Node's fetch ever sees them.
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === "string" && input.startsWith("/")) {
    return realFetch(BASE_URL + input, init);
  }
  return realFetch(input, init);
}) as typeof fetch;

function loadDotEnvLocal() {
  const envPath = path.join(PROJECT_ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs: number, pollMs = 250): Promise<boolean> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return true;
}

const RUN = (() => {
  const arg = process.argv.find((a) => a.startsWith("--run="));
  const v = arg?.split("=")[1];
  if (v !== "a" && v !== "b") {
    throw new Error("Pass --run=a (engaged) or --run=b (disengaged, Raj fallback)");
  }
  return v;
})();

async function main() {
  // Imported dynamically, after the fetch shim above is installed, and
  // after CLI parsing. This IS the real store, not a mirror of it.
  const { useSimStore } = await import("../src/store/simStore");
  const { useTaskflowStore } = await import("../src/store/taskflowStore");

  // Advances the real clock (via the store's own advanceClock, which fires
  // whatever scripted events are now due) from wherever it currently sits
  // up to an absolute target minute, so every step below can just state
  // "get to 9:45" instead of hand-tracking how many minutes
  // sendPlayerMessage's own internal +3 already spent.
  function advanceTo(targetMinutes: number) {
    const delta = targetMinutes - useSimStore.getState().clockMinutes;
    if (delta > 0) useSimStore.getState().advanceClock(delta);
  }

  useSimStore.getState().startDay();

  if (RUN === "a") {
    // --- Run (a): player chooses rollback at 9:45 after DMing Marcus about
    // payouts at 9:40, then submits a real postmortem. ---
    advanceTo(555); // 9:15 AM: priya-incidents-escalation fires
    console.log(`[clock ${useSimStore.getState().clockMinutes}] ack incident escalation`);
    await useSimStore
      .getState()
      .sendPlayerMessage("incidents", "Got it — looking into the Apple Pay failures now, will keep everyone posted.");

    advanceTo(578); // 9:38 AM: raj-tradeoff-offer fires
    console.log(
      `[clock ${useSimStore.getState().clockMinutes}] raj-tradeoff-offer fired: ${useSimStore.getState().firedEventIds.has("raj-tradeoff-offer")}`
    );

    advanceTo(580); // 9:40 AM
    console.log(`[clock ${useSimStore.getState().clockMinutes}] DM Marcus about payouts`);
    await useSimStore
      .getState()
      .sendPlayerMessage(
        "dm_marcus",
        "Hey — before we roll back, anything on the payout pipeline or the fast-track batch I should worry about?"
      );

    advanceTo(585); // 9:45 AM
    console.log(`[clock ${useSimStore.getState().clockMinutes}] decide rollback`);
    await useSimStore
      .getState()
      .sendPlayerMessage(
        "incidents",
        "Let's roll back — it's the sure fix, and I've already flagged it with Marcus on the payout side so we can get ahead of the seller impact once we take that hit."
      );

    const ticketId = useSimStore.getState().stateBag.tradeoffTicketId;
    if (ticketId) {
      useTaskflowStore.getState().assignTicket(ticketId, "jordan", useSimStore.getState().clockMinutes);
      console.log(`  assigned fix ticket ${ticketId} to jordan`);
    }

    advanceTo(810); // 1:30 PM: derek-escalation fires
    console.log(`[clock ${useSimStore.getState().clockMinutes}] ack derek's blast-radius ask`);
    await useSimStore
      .getState()
      .sendPlayerMessage(
        "dm_derek",
        "Blast radius: Apple Pay checkout failures only (~3% of attempts), card/Google Pay unaffected. Root cause: Stripe-side webhook flakiness, nothing we shipped. We rolled back payment-service to the pre-payout-speed build to stop it fast; seller payouts temporarily go back to the old cadence, Priya's getting ahead of that with affected sellers. Checkout success rate is back at baseline."
      );

    advanceTo(930); // 3:30 PM: postmortem-prompt fires
    console.log(`[clock ${useSimStore.getState().clockMinutes}] submit postmortem`);
    await useSimStore
      .getState()
      .sendPlayerMessage(
        "incidents",
        "Postmortem: Apple Pay checkout failures starting overnight, ~3% of attempts, caused by Stripe-side webhook flakiness (not something we shipped). I acknowledged the escalation, consulted Marcus on the payout pipeline before deciding, then chose to roll back payment-service to the pre-payout-speed build as the sure, fast fix, accepting the temporary seller-payout slowdown. Fix landed and checkout recovered to baseline. What I'd do differently: loop Priya and Marcus in even earlier, before Raj's offer, so the payout tradeoff was already sized by the time the decision had to be made."
      );
  } else {
    // --- Run (b): player never engages at all. Raj's automatic model-call
    // fallback should pick the fix path himself, Derek escalates, and the
    // day ends via the forced end-of-day boundary (never a postmortem). ---
    advanceTo(605); // 10:05 AM: crosses RAJ_FALLBACK_KICKOFF_MINUTES with tradeoffChoice still null
    console.log(
      `[clock ${useSimStore.getState().clockMinutes}] raj-tradeoff-offer fired: ${useSimStore.getState().firedEventIds.has("raj-tradeoff-offer")}, waiting on Raj's fallback model call...`
    );

    const resolved = await waitUntil(() => useSimStore.getState().stateBag.rajFallbackDecision !== null, 20_000);
    if (!resolved) {
      console.log("  Raj's fallback call did not resolve in time — forcing a scripted decision.");
      useSimStore.setState((s) => ({
        stateBag: {
          ...s.stateBag,
          rajFallbackDecision: {
            choice: "patch-forward",
            reasoning:
              "Couldn't reach the PM, so I made the call myself. Went with the patch since it keeps seller payouts live; I'll flag if it needs a second pass.",
            derekLine: "Going with the patch-forward fix. Starting now.",
            decidedAtMinutes: s.clockMinutes,
          },
        },
        rajFallbackInFlight: false,
      }));
    } else {
      console.log(`  Raj's fallback resolved: ${JSON.stringify(useSimStore.getState().stateBag.rajFallbackDecision)}`);
    }

    advanceTo(620); // 10:20 AM: derek-tradeoff-escalation applies the fallback decision
    console.log(
      `[clock ${useSimStore.getState().clockMinutes}] tradeoffEscalatedToDerek: ${useSimStore.getState().stateBag.tradeoffEscalatedToDerek}, tradeoffChoice: ${useSimStore.getState().stateBag.tradeoffChoice}`
    );

    advanceTo(1080); // 6:00 PM: hard end-of-day boundary, forces the day to end (never a postmortem)
    console.log(`[clock ${useSimStore.getState().clockMinutes}] dayComplete: ${useSimStore.getState().dayComplete}`);
  }

  // Let the async coordination-score / study-areas calls settle so the
  // printed record reflects its final state, not a mid-flight placeholder.
  await waitUntil(() => {
    const r = useSimStore.getState().dayRecords[0];
    return Boolean(r) && !r.crossFunctionalLoading && !r.studyAreasLoading;
  }, 20_000);

  const record = useSimStore.getState().dayRecords[0];
  if (!record) {
    console.error("No day record was produced.");
    process.exit(1);
  }
  console.log(`\n=== Run ${RUN} — record.outcome ===`);
  console.log(JSON.stringify(record.outcome, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
