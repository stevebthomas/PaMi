import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, EVALUATOR_MODEL, extractText, extractUsage } from "@/lib/agents/anthropic";
import { CS_TEMPLATE_EVAL_PROMPT } from "@/lib/agents/prompts";

interface EvalCsTemplateBody {
  /** The player's drafted customer-facing message. */
  draft: string;
  /** Full transcript so far — what lets the evaluator check whether the
   * draft states anything not actually established yet. */
  transcript: { senderId: string; channel: string; content: string; sentAtSimMinutes: number }[];
}

/**
 * Judges a candidate CS-template draft for quality/groundedness — gates
 * whether it's good enough to set csTemplateProvided (see Feature A: the
 * flag now means "provided AND good," not just "attempted").
 */
export async function POST(request: Request) {
  const body: EvalCsTemplateBody = await request.json();
  const { draft, transcript } = body;

  let client: Anthropic;
  try {
    client = getAnthropicClient();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }

  const transcriptText = transcript.map((m) => `[${m.sentAtSimMinutes}min][${m.channel}] ${m.senderId}: ${m.content}`).join("\n");

  try {
    const response = await client.messages.create({
      model: EVALUATOR_MODEL,
      max_tokens: 300,
      system: CS_TEMPLATE_EVAL_PROMPT,
      output_config: { effort: "low" },
      messages: [
        { role: "user", content: `Transcript so far:\n${transcriptText}\n\nDrafted customer-facing message:\n"${draft}"` },
      ],
    });

    const raw = extractText(response);
    const usage = { ...extractUsage(response), model: EVALUATOR_MODEL };
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ good: false, note: "", usage });
    }
    const parsed = JSON.parse(match[0]);
    return NextResponse.json({
      good: Boolean(parsed.good),
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
