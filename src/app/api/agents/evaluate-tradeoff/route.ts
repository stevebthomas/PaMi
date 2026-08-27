import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, EVALUATOR_MODEL, extractText, extractUsage } from "@/lib/agents/anthropic";
import { TRADEOFF_EVAL_PROMPT } from "@/lib/agents/prompts";

interface EvalTradeoffBody {
  /** Raj's exact tradeoff-offer message, for grounding. */
  offer: string;
  /** The player's reply. */
  reply: string;
}

const VALID_CHOICES = ["rollback", "patch-forward", "unclear"];

/** Classifies which side of the rollback-vs-patch-forward tradeoff the
 * player chose, and whether they stated real reasoning for it. */
export async function POST(request: Request) {
  const body: EvalTradeoffBody = await request.json();
  const { offer, reply } = body;

  let client: Anthropic;
  try {
    client = getAnthropicClient();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }

  try {
    const response = await client.messages.create({
      model: EVALUATOR_MODEL,
      max_tokens: 300,
      system: TRADEOFF_EVAL_PROMPT,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: `Engineer's offer:\n"${offer}"\n\nPlayer's reply:\n"${reply}"` }],
    });

    const raw = extractText(response);
    const usage = { ...extractUsage(response), model: EVALUATOR_MODEL };
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ choice: "unclear", hasReasoning: false, note: "", usage });
    }
    const parsed = JSON.parse(match[0]);
    const choice = VALID_CHOICES.includes(parsed.choice) ? parsed.choice : "unclear";
    return NextResponse.json({
      choice,
      hasReasoning: Boolean(parsed.hasReasoning),
      note: typeof parsed.note === "string" ? parsed.note : "",
      usage,
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }
    throw error;
  }
}
