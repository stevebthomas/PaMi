import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, EVALUATOR_MODEL, extractText, extractUsage } from "@/lib/agents/anthropic";
import { SCORE_EXPLANATION_PROMPT } from "@/lib/agents/prompts";
import { SCORECARD_CATEGORIES, validateQuotes } from "@/lib/sim/scorecard";
import type { CategoryExplanation, ScorecardScores } from "@/lib/sim/types";

interface ExplainRequestBody {
  /** The full day transcript (every channel/DM, all speakers): the source
   * of truth the model explains against and the ONLY text a returned quote is
   * allowed to be a verbatim substring of (player lines only). */
  transcript: { senderId: string; channel: string; content: string; sentAtSimMinutes: number }[];
  /** The five final scores: already computed, including the resolved
   * cross-functional score. The model explains these; it never re-scores. */
  scores: ScorecardScores;
  /** The internal grader notes assembled for the day (the per-message eval
   * feedback plus synthetic notes), passed so their signal folds into the
   * relevant category explanation rather than being lost when the flat
   * coaching-notes dump is removed from the UI. */
  graderNotes: { label?: string; feedback: string }[];
}

/**
 * Day-end summarization layer (subtask C1): one whole-transcript model call
 * that turns the five final scores + the internal grader notes into five
 * short, evidence-backed "why this score" explanations, each with up to two
 * quotes. Same model tier and shape as the coordination route.
 *
 * The hard integrity rule (a shown quote must be a real verbatim substring of
 * an actual player message) is enforced HERE in code via validateQuotes, not
 * left to the prompt: every candidate quote the model returns is checked
 * against the player's own transcript lines and dropped if it isn't genuine.
 */
export async function POST(request: Request) {
  const body: ExplainRequestBody = await request.json();
  const { transcript, scores, graderNotes } = body;

  const playerMessages = transcript.filter((m) => m.senderId === "player").map((m) => m.content);
  // Nothing the player said means nothing to explain or quote: the caller
  // already avoids this for zero-engagement days, but guard anyway.
  if (playerMessages.length === 0) {
    return NextResponse.json({ explanations: [] as CategoryExplanation[] });
  }

  let client: Anthropic;
  try {
    client = getAnthropicClient();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }

  const transcriptText = transcript
    .map((m) => `[${m.sentAtSimMinutes}min][${m.channel}] ${m.senderId}: ${m.content}`)
    .join("\n");

  const scoresBlock = SCORECARD_CATEGORIES.map(
    ({ category, label }) => `- ${label}: ${scores[category].toFixed(1)}/10`
  ).join("\n");

  const notesBlock =
    graderNotes.length > 0
      ? graderNotes.map((n) => `- ${n.label ? `[${n.label}] ` : ""}${n.feedback}`).join("\n")
      : "(none)";

  try {
    const response = await client.messages.create({
      model: EVALUATOR_MODEL,
      // Five explanations of 2-4 sentences each, plus quotes, needs more room
      // than the coordination route's single sentence.
      max_tokens: 1500,
      system: SCORE_EXPLANATION_PROMPT,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: `Full day transcript, chronological, every channel/DM (only lines tagged "player:" are the player's own words and eligible to quote):\n\n${transcriptText}\n\nThe five final scores to explain:\n${scoresBlock}\n\nInternal grader notes captured during the day (use as supporting signal; a note's [label], if present, hints which dimension it bears on):\n${notesBlock}`,
        },
      ],
    });

    const raw = extractText(response);
    const usage = { ...extractUsage(response), model: EVALUATOR_MODEL };
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ explanations: [] as CategoryExplanation[], usage });
    }
    const parsed = JSON.parse(match[0]);
    const returned: unknown[] = Array.isArray(parsed.explanations) ? parsed.explanations : [];

    // Build exactly one entry per known category, in canonical order, so the
    // shape is stable regardless of what/how the model ordered things. Quotes
    // are validated against the real player transcript before they're kept.
    const explanations: CategoryExplanation[] = [];
    for (const { category } of SCORECARD_CATEGORIES) {
      const entry = returned.find(
        (e): e is Record<string, unknown> =>
          typeof e === "object" && e !== null && (e as Record<string, unknown>).category === category
      );
      if (!entry) continue;
      const explanation = typeof entry.explanation === "string" ? entry.explanation.trim() : "";
      if (explanation.length === 0) continue;
      explanations.push({
        category,
        explanation,
        quotes: validateQuotes(entry.quotes, playerMessages),
      });
    }

    return NextResponse.json({ explanations, usage });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }
    throw error;
  }
}
