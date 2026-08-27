import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, EVALUATOR_MODEL, extractText, extractUsage } from "@/lib/agents/anthropic";
import { COORDINATION_PROMPT } from "@/lib/agents/prompts";

interface CoordinationRequestBody {
  /** The player's own messages across the day, each with enough context to
   * judge who they were talking to and when. Intentionally just the raw
   * transcript — no persona identity, no "this is a playtest" framing, so
   * the evaluator has no way to know who or what it's grading. */
  transcript: { senderId: string; channel: string; content: string; sentAtSimMinutes: number }[];
}

/**
 * Judges cross-functional coordination across the whole day via an explicit
 * rubric, replacing the old keyword-regex heuristic — a player can coordinate
 * well without ever typing the word "template".
 */
export async function POST(request: Request) {
  const body: CoordinationRequestBody = await request.json();
  const { transcript } = body;

  if (transcript.length === 0) {
    return NextResponse.json({ score: 3, note: "No coordination activity to grade." });
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

  try {
    const response = await client.messages.create({
      model: EVALUATOR_MODEL,
      max_tokens: 500,
      system: COORDINATION_PROMPT,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: transcriptText }],
    });

    const raw = extractText(response);
    const usage = { ...extractUsage(response), model: EVALUATOR_MODEL };
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ score: 5, note: "", usage });
    }
    const parsed = JSON.parse(match[0]);
    const score = Math.max(0, Math.min(10, Math.round(Number(parsed.score) || 5)));

    return NextResponse.json({ score, note: typeof parsed.note === "string" ? parsed.note : "", usage });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }
    throw error;
  }
}
