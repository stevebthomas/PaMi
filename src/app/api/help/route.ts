import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, ASK_CLAUDE_MODEL, extractText, extractUsage, stripEmDashes } from "@/lib/agents/anthropic";
import { ASK_CLAUDE_PROMPT, ASK_CLAUDE_TAG_INSTRUCTION } from "@/lib/agents/prompts";

interface HelpRequestBody {
  /** Full conversation so far, including the player's latest question as
   * the last entry: mirrors the shape used for Raj/Priya/Derek's history. */
  history: { senderId: "assistant" | "player"; content: string }[];
}

const TOPIC_LINE = /\n?TOPIC:\s*(.+)\s*$/i;

/**
 * Glossary/concepts helper: explains jargon only, never coaches on the
 * scenario itself. Every answer ends with a machine-readable "TOPIC: ..."
 * line that gets parsed out here and returned separately for logging;
 * the player never sees that line.
 */
export async function POST(request: Request) {
  const body: HelpRequestBody = await request.json();
  const { history } = body;

  let client: Anthropic;
  try {
    client = getAnthropicClient();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.senderId === "player" ? "user" : "assistant",
    content: m.content,
  }));

  try {
    const response = await client.messages.create({
      model: ASK_CLAUDE_MODEL,
      max_tokens: 700,
      system: ASK_CLAUDE_PROMPT + ASK_CLAUDE_TAG_INSTRUCTION,
      messages,
    });

    const raw = extractText(response);
    const match = raw.match(TOPIC_LINE);
    const topicTag = match ? match[1].trim() : null;
    const answer = stripEmDashes(match ? raw.slice(0, match.index).trim() : raw);

    return NextResponse.json({
      answer,
      topicTag: topicTag && topicTag.toUpperCase() !== "N/A" ? topicTag : null,
      usage: { ...extractUsage(response), model: ASK_CLAUDE_MODEL },
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }
    throw error;
  }
}
