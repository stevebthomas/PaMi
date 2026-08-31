import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, EVALUATOR_MODEL, extractText, extractUsage } from "@/lib/agents/anthropic";
import { FOLLOWUP_TICKET_PROMPT } from "@/lib/agents/prompts";

interface SuggestFollowupBody {
  postmortemText: string;
}

/** Pulls one concrete, actionable line out of a postmortem's "what I'd do
 * differently" section to pre-fill the follow-up Taskflow ticket prompt,
 * see FOLLOWUP_TICKET_PROMPT. */
export async function POST(request: Request) {
  const body: SuggestFollowupBody = await request.json();
  const { postmortemText } = body;

  if (!postmortemText.trim()) {
    return NextResponse.json({ title: null });
  }

  let client: Anthropic;
  try {
    client = getAnthropicClient();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }

  try {
    const response = await client.messages.create({
      model: EVALUATOR_MODEL,
      max_tokens: 200,
      system: FOLLOWUP_TICKET_PROMPT,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: `Postmortem:\n\n${postmortemText}` }],
    });

    const raw = extractText(response);
    const usage = { ...extractUsage(response), model: EVALUATOR_MODEL };
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ title: null, usage });
    }
    const parsed = JSON.parse(match[0]);
    return NextResponse.json({ title: typeof parsed.title === "string" ? parsed.title : null, usage });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }
    throw error;
  }
}
