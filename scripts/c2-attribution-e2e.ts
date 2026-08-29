/**
 * C2 end-to-end (case b) against the REAL simStore + REAL API routes, modeled
 * on scripts/test-day-outcome.ts. Plays a rollback day where the player NEVER
 * asks Priya anything, then tells Derek the ~60-seller figure is "Priya's
 * estimate" — an unverified attribution — and submits a postmortem. Prints the
 * stored claims ledger, the resulting stakeholderMgmt score, the "Attribution
 * accuracy" coaching note, and the rendered stakeholderMgmt category
 * explanation (the live C1 summarizer's output).
 *
 * Requires the dev server on TEST_BASE_URL (default :3000) + ANTHROPIC_API_KEY.
 * Run: tsx scripts/c2-attribution-e2e.ts
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

const realFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === "string" && input.startsWith("/")) return realFetch(BASE_URL + input, init);
  return realFetch(input, init);
}) as typeof fetch;

(function loadDotEnvLocal() {
  const envPath = path.join(PROJECT_ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    if (!(k in process.env)) process.env[k] = t.slice(eq + 1).trim();
  }
})();

async function waitUntil(pred: () => boolean, timeoutMs: number, pollMs = 250): Promise<boolean> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return true;
}

async function main() {
  const { useSimStore } = await import("../src/store/simStore");
  const { useTaskflowStore } = await import("../src/store/taskflowStore");
  const S = () => useSimStore.getState();
  const advanceTo = (t: number) => {
    const d = t - S().clockMinutes;
    if (d > 0) S().advanceClock(d);
  };

  S().startDay();

  advanceTo(555); // 9:15 — incident escalation
  await S().sendPlayerMessage("incidents", "On it — digging into the Apple Pay checkout failures now, will keep everyone posted.");

  // 9:20 — EARLY unverified attribution: the player pins ~60 sellers on Priya
  // before Priya (or anyone) has ever stated a seller count. Priya has only
  // said "14 tickets" + offered to pull numbers, and the attribution check is
  // time-bounded to messages at/before this claim, so a later Priya "~60"
  // reply can't retroactively ground it. Player NEVER DMed Priya.
  advanceTo(560);
  await S().sendPlayerMessage(
    "dm_derek",
    "Early read for your sync: about 60 sellers are affected by the payout issue. That's Priya's estimate."
  );

  // Confirm what Priya had actually said by this point, and wait for the Derek
  // DM's evaluation (with its claims ledger) to land BEFORE day end — otherwise
  // the fire-and-forget grading races the synchronous computeScorecard.
  console.log("\n=== Priya messages at/before the claim (min 560) ===");
  for (const m of S().messages.filter((m) => m.senderId === "priya" && m.sentAtSimMinutes <= 560)) {
    console.log(`[${m.sentAtSimMinutes}] ${m.content}`);
  }
  const derekEvalLanded = await waitUntil(
    () => Object.values(S().evaluations).some((e) => e.eventId === "dm_derek" && (e.claims?.length ?? 0) > 0),
    30_000
  );
  console.log("derek eval with claims landed before day-end:", derekEvalLanded);

  advanceTo(585); // 9:45 — decide rollback (no escalation penalty).
  await S().sendPlayerMessage("incidents", "Let's roll back to the pre-payout-speed build — it's the sure, fast fix. We'll take the temporary seller-payout slowdown.");
  const ticketId = S().stateBag.tradeoffTicketId;
  if (ticketId) useTaskflowStore.getState().assignTicket(ticketId, "jordan", S().clockMinutes);

  advanceTo(930); // 3:30 — postmortem
  await S().sendPlayerMessage(
    "incidents",
    "Postmortem: Apple Pay checkout failures from Stripe-side webhook flakiness, roughly 3% of attempts. I acknowledged the escalation, chose to roll back to the pre-payout-speed build as the sure fix, and checkout recovered to baseline. Seller payouts went back to the old cadence temporarily. What I'd do differently: size the seller-payout impact with Priya directly before committing, rather than after."
  );

  const settled = await waitUntil(() => {
    const r = S().dayRecords[0];
    return Boolean(r) && !r.crossFunctionalLoading && !r.studyAreasLoading && !r.explanationsLoading;
  }, 40_000);

  const record = S().dayRecords[0];
  if (!record) {
    console.error("No day record produced.");
    process.exit(1);
  }

  // The claims ledger stored on the Derek-DM evaluation.
  console.log("\n=== stored claims ledgers (evaluations with claims) ===");
  for (const e of Object.values(S().evaluations)) {
    if (e.claims && e.claims.length > 0) {
      console.log(`eventId=${e.eventId}`, JSON.stringify(e.claims, null, 2));
    }
  }

  console.log("\n=== scores ===");
  console.log(JSON.stringify(record.scores, null, 2));
  console.log("explanations settled:", settled);

  console.log("\n=== 'Attribution accuracy' coaching note(s) ===");
  for (const c of record.coachingNotes.filter((c) => c.label === "Attribution accuracy")) {
    console.log("-", c.feedback);
  }

  console.log("\n=== rendered stakeholderMgmt explanation (live C1 summarizer) ===");
  const stake = record.categoryExplanations?.find((c) => c.category === "stakeholderMgmt");
  console.log(stake ? stake.explanation : "(no categoryExplanations — summarizer may have failed)");
  if (stake?.quotes?.length) console.log("quotes:", stake.quotes);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
