/**
 * Scenario ambiguity audit: a one-time STATIC design-review pass over the
 * Day 1 scenario script and the ambient systems that react to it (unread
 * badges, escalating DM follow-ups, mood shifts, reactive-agent routing).
 * No AI persona roleplay, no playthrough. This reads the actual scenario
 * data and implementation source and reasons about where a real player
 * could plausibly be confused about whether/who to respond to, then pairs
 * each finding with a concrete, buildable suggestion for the ambient
 * feedback system (not "tell the player what to do").
 *
 * Requires a valid ANTHROPIC_API_KEY. Run with: npm run scenario-audit
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { updateFindingsLog, renderFindingsSummaryTable } from "./lib/findings-log";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(PROJECT_ROOT, "scenario-audit-day1.md");
const FINDINGS_LOG_PATH = path.join(PROJECT_ROOT, "scenario-audit-findings-log.json");

loadDotEnvLocal();

const MODEL = process.env.SCENARIO_AUDIT_MODEL || "claude-opus-5";

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

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relPath), "utf-8");
}

// The scenario script itself, plus every real-code system that reacts to
// (or fails to react to) the player during it: feeding the actual
// implementation, not a hand-summarized description, is what lets the
// model catch integration-level gaps (e.g. a state flag that only updates
// for one of two channels a reasonable reply could land in).
const SOURCES: { label: string; path: string }[] = [
  { label: "Day 1 scripted scenario events", path: "src/data/day1-scenario.ts" },
  { label: "Reactive NPC routing (who answers a player message, and when)", path: "src/lib/sim/relevance.ts" },
  { label: "Sim store — clock advance, scripted-event firing, unread badges, player-message handling, mood/lateness state", path: "src/store/simStore.ts" },
  { label: "Channel/DM sidebar — how the unread badge actually renders", path: "src/components/chattr/ChannelList.tsx" },
  { label: "Agent mood/lateness prompt injection", path: "src/lib/agents/prompts.ts" },
  { label: "Scorecard scoring formula (what mechanically depends on acknowledgment state)", path: "src/lib/sim/scorecard.ts" },
];

const ANALYSIS_PROMPT = `You are reviewing the design of a product management training simulation's Day 1 incident scenario. You will be given the actual TypeScript source for: the scripted event timeline, the reactive-NPC-routing logic, the sim store (which fires scripted events, tracks unread badges, and processes player messages), the sidebar badge UI, the mood/lateness prompt injection, and the scoring formula.

For each scripted message/event in the timeline, assess: would a reasonable person — especially someone new to this kind of work — clearly understand whether they are expected to respond, and to whom? Flag any moment where that is NOT obvious, i.e. where the expectation to act (or who to address) is implicit rather than explicit.

Read the surrounding systems as real implementation, not flavor text. In particular:
- Trace which state flags actually gate later behavior (escalation follow-ups, scoring) and whether the channel(s) that flip that flag match every channel a reasonable player might plausibly reply in.
- Trace the reactive-routing default: when a player's reply doesn't clearly match either NPC's keywords in a shared channel, who actually answers — and does that match who a reasonable player would expect to hear back from, given who raised the point?
- The unread badge is purely "seen vs. not seen" (clears on opening the channel). Consider whether that's the same thing as "the player has actually acted," and where those two could diverge.

For each ambiguous moment you flag, respond with:
1. "id": a stable, kebab-case tracking key, built as exactly: the scripted event's own literal id from day1-scenario.ts (e.g. "priya-heads-up-dm", "raj-diagnosis") + a hyphen + ONE short category tag picked from this fixed list, whichever fits best: "ack-gap" (the acknowledgment/response expectation itself is unclear), "routing-ambiguity" (unclear who should answer, or a reply could get misrouted), "silent-resolution" (a status update could create a false sense the situation is already handled), "badge-mismatch" (the unread/seen state diverges from "the player actually acted"), "deadline-unclear" (no felt urgency or consequence for missing a window), "state-flag-gap" (a state flag's gating condition doesn't cover every plausible reply channel). If truly none of these categories fit, use "other" as the tag. This exact-format id (event id + fixed category, e.g. "priya-heads-up-dm-ack-gap") is compared across separate runs of this same audit to tell whether an issue is new or recurring — do NOT invent your own free-text descriptor here, use only these categories so the same underlying issue produces the same id on a re-run. If two distinct issues on the SAME event need the same category, add a numeral suffix (e.g. "-2").
2. "event": which specific message/event it is (id + a short quote)
3. "why_ambiguous": why a reasonable person could plausibly misread whether/who to respond to — be concrete, not generic
4. "existing_coverage": does an existing mechanism (the unread badge, a scripted DM follow-up, requiresResponse/responseDeadlineMinutes + the lateResponseTo tone nudge, a mood shift) already adequately handle this, or is it a real gap? Say which mechanism, specifically, and why it does or doesn't cover this case.
5. "suggested_response": a concrete, implementable suggestion for how the simulation could make the situation's urgency more *felt* by a player who doesn't act on it — in the spirit of the existing badge/follow-up ambient system already in the code you were given. Not "add a hint" — name the actual mechanism (a new badge state, a widened state-flag condition, a routing tiebreak, a templated callback line) and roughly how it would plug into the existing code you just read. Do not propose removing the challenge or telling the player what to do.
6. "confidence": "high" | "medium" | "low" — how confident you are this is a genuine, non-contrived ambiguity worth acting on.

Keep "why_ambiguous", "existing_coverage", and "suggested_response" each to at most 3 sentences. Be concrete and specific within that budget rather than exhaustive — this is a punch list, not an essay.

Do not flag every message — only genuinely ambiguous ones. A message that clearly and directly asks the player something is not ambiguous, even if it's high-stakes. A pure system notification or announcement is not ambiguous. Purely informational status updates that don't require an answer are not ambiguous *unless* their presence could create a false sense that the situation is already handled — call that out specifically if you flag it, don't lump it in as if it required a response itself.

Respond with ONLY a JSON object of the shape:
{"findings": [{"id": "...", "event": "...", "why_ambiguous": "...", "existing_coverage": "...", "suggested_response": "...", "confidence": "high"|"medium"|"low"}]}

No markdown fencing, no prose outside the JSON.`;

interface Finding {
  id: string;
  event: string;
  why_ambiguous: string;
  existing_coverage: string;
  suggested_response: string;
  confidence: "high" | "medium" | "low";
}

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (checked .env.local and the environment).");
    process.exit(1);
  }

  const client = new Anthropic();

  const sourceBlock = SOURCES.map(
    (s) => `### ${s.label}\nFile: ${s.path}\n\`\`\`typescript\n${readSource(s.path)}\n\`\`\``
  ).join("\n\n");

  console.log(`Running static scenario audit (${MODEL})...`);

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 20000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system: ANALYSIS_PROMPT,
    messages: [{ role: "user", content: sourceBlock }],
  });
  const response = await stream.finalMessage();
  const raw = extractText(response);

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error("No JSON found in model output. Raw output:\n", raw);
    process.exit(1);
  }

  let findings: Finding[];
  try {
    findings = JSON.parse(match[0]).findings ?? [];
  } catch (err) {
    console.error("Failed to parse JSON. Raw output:\n", raw);
    throw err;
  }

  // Defensive fallback only: the prompt asks for a stable id on every
  // finding, but if the model ever omits one, derive something from the
  // event text rather than let cross-run matching silently break.
  findings.forEach((f, i) => {
    if (!f.id || typeof f.id !== "string") {
      f.id = `${f.event ?? "finding"}-${i}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 60);
    }
  });

  console.log(`Found ${findings.length} genuinely ambiguous moment(s).`);

  const confidenceOrder: Record<Finding["confidence"], number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

  // Cross-run tracking: see scripts/lib/findings-log.ts. `current` and
  // `findings` stay index-aligned so the status info zips back onto each
  // finding's full detail below.
  const runLabel = new Date().toISOString();
  const logUpdate = updateFindingsLog(
    FINDINGS_LOG_PATH,
    findings.map((f) => ({ id: f.id, summary: f.event })),
    runLabel
  );

  const lines: string[] = [];
  lines.push("# Day 1 scenario ambiguity audit");
  lines.push("");
  lines.push(
    `Static design review of \`src/data/day1-scenario.ts\` and the systems that react to it (unread badges, DM escalations, mood shifts, reactive-NPC routing). No AI playtesting was run for this pass — it's a direct read of the scenario and implementation source. Generated by \`scripts/scenario-audit.ts\` (${MODEL}).`
  );
  lines.push("");
  lines.push(`**${findings.length} genuinely ambiguous moment(s) flagged this run.**`);
  lines.push("");
  lines.push("## Findings history (this run vs. every prior run)");
  lines.push("");
  lines.push(renderFindingsSummaryTable(logUpdate));
  lines.push("");

  findings.forEach((f, i) => {
    const status = logUpdate.currentAnnotated[i];
    const statusLine = status.regressed
      ? `Still open — regressed (was marked fixed as of a prior run, first flagged ${status.firstSeenRun}, seen ${status.timesSeen}×)`
      : status.status === "new"
        ? "New this run"
        : `Still open (seen ${status.timesSeen}× since ${status.firstSeenRun})`;
    lines.push(`## ${i + 1}. ${f.event}`);
    lines.push("");
    lines.push(`**Status:** ${statusLine} · **Confidence:** ${f.confidence} · **id:** \`${f.id}\``);
    lines.push("");
    lines.push(`**Why it's ambiguous:** ${f.why_ambiguous}`);
    lines.push("");
    lines.push(`**Existing coverage:** ${f.existing_coverage}`);
    lines.push("");
    lines.push(`**Suggested fix:** ${f.suggested_response}`);
    lines.push("");
  });

  if (logUpdate.allFixed.length > 0) {
    lines.push("## Confirmed fixed (not present in this run)");
    lines.push("");
    logUpdate.allFixed.forEach((e) => {
      lines.push(`- \`${e.id}\` — ${e.summary} (first flagged ${e.firstSeenRun}, fixed as of ${e.lastSeenRun})`);
    });
    lines.push("");
  }

  fs.writeFileSync(OUT_PATH, lines.join("\n"));
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Updated findings log: ${FINDINGS_LOG_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
