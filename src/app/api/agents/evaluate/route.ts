import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, EVALUATOR_MODEL, extractText, extractUsage } from "@/lib/agents/anthropic";
import { EVALUATOR_PROMPT } from "@/lib/agents/prompts";
import { normalizeQuoteWhitespace } from "@/lib/sim/scorecard";
import type { ClaimLedgerEntry } from "@/lib/sim/types";

interface EvaluateRequestBody {
  /** The player's message being scored — must be the last entry in `transcript`. */
  playerMessage: string;
  /** Which channel/DM `playerMessage` was sent in. */
  channel: string;
  /** Full message history up to and including `playerMessage`, across every
   * channel/DM the player has seen so far (chronological). This is what lets
   * the evaluator check whether a stated fact was actually established
   * before this message, instead of grading the message in a vacuum. */
  transcript: {
    senderId: string;
    channel: string;
    content: string;
    sentAtSimMinutes: number;
    /** For a player message sent during an active incident, the Pulse
     * dashboard reading as it stood at that moment (see pulseMetrics'
     * dashboardReadingAt). Rendered as an explicit [pulse] DASHBOARD system
     * line just before the player line, so a figure the player read off
     * Pulse counts as a grounded, system-supplied fact. Absent on NPC/system
     * messages and on player messages sent before the incident started. */
    dashboard?: string;
  }[];
  /** Optional, deterministic, transcript-derived facts about how the player
   * has communicated this session (message count, typical length, question
   * ratio, response speed, see src/lib/sim/sessionObservations.ts). Rendered
   * into the user message as tone/framing guidance ONLY: the prompt forbids
   * these from changing any numeric score. Omitted by headless callers. */
  observations?: string[];
}

interface EvaluationResult {
  tone: number;
  speed: number;
  completeness: number;
  strategicThinking: number;
  feedback: string;
  /** The evaluator's per-message claims ledger (C2), captured and code-validated
   * here rather than discarded. See parseClaims / ClaimLedgerEntry. */
  claims: ClaimLedgerEntry[];
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.max(0, Math.min(10, Math.round(n)));
}

const CLAIM_STATUSES = new Set<ClaimLedgerEntry["status"]>(["GROUNDED", "UNSOURCED", "CHALLENGED"]);

/**
 * Parse and CODE-VALIDATE the evaluator's claims ledger (C2). Every well-formed
 * claim is KEPT — the claim itself is signal even when its evidence is bad — but
 * the model-emitted `source` is treated as unverified: we independently check
 * whether that quote actually appears in the transcript the route received and
 * record the result as `sourceQuoteValidated`, rather than persisting it as if
 * it were confirmed (docs/technical-audit.md:105, and the C1 validateQuotes
 * pattern). This never DROPS a claim on a bad source; it only marks the source.
 * The attribution field is carried through verbatim (only trimmed / omitted when
 * empty); its deterministic verification happens later in scorecard.ts, not
 * here, and deliberately does not depend on this `source` at all.
 */
function parseClaims(rawClaims: unknown, transcriptLineContents: string[]): ClaimLedgerEntry[] {
  if (!Array.isArray(rawClaims)) return [];
  const haystacks = transcriptLineContents.map(normalizeQuoteWhitespace).filter((h) => h.length > 0);
  const claims: ClaimLedgerEntry[] = [];
  for (const raw of rawClaims) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const claim = typeof r.claim === "string" ? r.claim.trim() : "";
    if (claim.length === 0) continue;
    const status =
      typeof r.status === "string" && CLAIM_STATUSES.has(r.status as ClaimLedgerEntry["status"])
        ? (r.status as ClaimLedgerEntry["status"])
        : "UNSOURCED";
    const source = typeof r.source === "string" ? r.source.trim() : "";
    const normalizedSource = normalizeQuoteWhitespace(source);
    const sourceQuoteValidated =
      normalizedSource.length > 0 && haystacks.some((h) => h.includes(normalizedSource));
    const attributedTo = typeof r.attributedTo === "string" ? r.attributedTo.trim() : "";
    const entry: ClaimLedgerEntry = { claim, status, source, sourceQuoteValidated };
    if (attributedTo.length > 0) entry.attributedTo = attributedTo;
    claims.push(entry);
  }
  return claims;
}

/** Grades a player's message against the four Day 1 scoring dimensions,
 * checking the claim against the real transcript rather than a static
 * summary — see EVALUATOR_PROMPT's groundedness check. */
export async function POST(request: Request) {
  const body: EvaluateRequestBody = await request.json();
  const { playerMessage, channel, transcript, observations } = body;

  let client: Anthropic;
  try {
    client = getAnthropicClient();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }

  const transcriptText = transcript
    .map((m, i) => {
      const speaker = m.senderId === "player" ? "PLAYER" : m.senderId;
      const marker = i === transcript.length - 1 ? "  <-- GRADE THIS ONE" : "";
      const line = `[${m.sentAtSimMinutes}min][${m.channel}] ${speaker}: ${m.content}${marker}`;
      // A Pulse reading rides just above the player line it was captured
      // with, as its own system data-source line at the same minute, so the
      // evaluator can ground a figure the player read off the dashboard at
      // that moment (and only readings at or before a given line count).
      if (m.dashboard) {
        return `[${m.sentAtSimMinutes}min][pulse] DASHBOARD: ${m.dashboard}\n${line}`;
      }
      return line;
    })
    .join("\n");

  // Deterministic behavioral-tone facts, if the caller supplied them. Purely
  // framing input for the feedback wording. The prompt is explicit that these
  // must never move a score.
  const observationsBlock =
    observations && observations.length > 0
      ? `\n\nHOW THE PLAYER HAS COMMUNICATED THIS SESSION (deterministic, transcript-derived; use ONLY to frame the wording of "feedback", never to change any score):\n${observations
          .map((o) => `- ${o}`)
          .join("\n")}`
      : "";

  try {
    const response = await client.messages.create({
      model: EVALUATOR_MODEL,
      // The evaluator now emits a per-claim grounding ledger before the
      // scores (see EVALUATOR_PROMPT), so a long postmortem with many
      // claims needs more room than the old 500 or the trailing JSON with
      // the scores gets truncated and we fall back to a neutral result.
      max_tokens: 1500,
      system: EVALUATOR_PROMPT,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: `Full conversation so far, chronological, every channel/DM the player has seen:\n\n${transcriptText}\n\nGrade only the message marked "<-- GRADE THIS ONE" above, which the player sent in ${channel}. Everything before it is the established context to check groundedness against.\n\nMessage to grade: "${playerMessage}"${observationsBlock}`,
        },
      ],
    });

    const raw = extractText(response);
    const usage = { ...extractUsage(response), model: EVALUATOR_MODEL };
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Matches every other evaluator route's fallback shape (degrade to a
      // neutral result instead of throwing an unhandled 500) — this route
      // used to be the one outlier that threw here.
      return NextResponse.json({ tone: 5, speed: 5, completeness: 5, strategicThinking: 5, feedback: "", claims: [], usage });
    }
    const parsed = JSON.parse(jsonMatch[0]);

    const result: EvaluationResult = {
      tone: clampScore(parsed.tone),
      speed: clampScore(parsed.speed),
      completeness: clampScore(parsed.completeness),
      strategicThinking: clampScore(parsed.strategicThinking),
      feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
      // Capture the ledger the evaluator already emits (the prompt fills "claims"
      // before it scores). Validated against the transcript we received, never
      // trusted blind — see parseClaims.
      claims: parseClaims(parsed.claims, transcript.map((m) => m.content)),
    };

    return NextResponse.json({ ...result, usage });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }
    throw error;
  }
}
