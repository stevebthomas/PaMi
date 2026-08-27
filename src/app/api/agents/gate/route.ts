import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, GATE_MODEL, extractText, extractUsage } from "@/lib/agents/anthropic";
import { CROSS_FUNCTIONAL_GATE_PROMPT } from "@/lib/agents/prompts";
import type { AgentId } from "@/lib/sim/types";

interface GateRequestBody {
  playerMessage: string;
  /** Which persona is replying (or just replied) to playerMessage. */
  primaryAgentId: AgentId;
  /** That persona's own reply text, if it's already been generated — Stage B
   * runs after the primary reply resolves (see the latency note in
   * sendPlayerMessage), so this is almost always present. */
  primaryReply: string;
}

interface GateResult {
  crossFunctional: boolean;
  secondAgent: AgentId | null;
  reason: string;
}

const VALID_AGENTS: AgentId[] = ["raj", "priya", "derek", "sam"];

/**
 * Stage B of the cross-functional gate — a cheap Haiku-tier classifier,
 * only called when Stage A (src/lib/sim/crossFunctionalGate.ts, free,
 * client-side) didn't already decide "no." Deliberately minimal context:
 * just the player's message and the primary persona's reply, not the full
 * transcript, to keep this call cheap.
 */
export async function POST(request: Request) {
  const body: GateRequestBody = await request.json();
  const { playerMessage, primaryAgentId, primaryReply } = body;

  let client: Anthropic;
  try {
    client = getAnthropicClient();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }

  const userContent = `Player's message: "${playerMessage}"\n\nPersona replying: ${primaryAgentId}\n\nThat persona's reply: "${primaryReply}"`;

  try {
    const response = await client.messages.create({
      model: GATE_MODEL,
      max_tokens: 200,
      system: CROSS_FUNCTIONAL_GATE_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const raw = extractText(response);
    const usage = extractUsage(response);
    const match = raw.match(/\{[\s\S]*\}/);

    // Fail-safe default, same pattern as every other JSON call in this app:
    // missing/invalid → safe default (no cross-functional reaction), never a retry loop.
    let result: GateResult = { crossFunctional: false, secondAgent: null, reason: "" };
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        const secondAgent = VALID_AGENTS.includes(parsed.second_agent) ? (parsed.second_agent as AgentId) : null;
        result = {
          crossFunctional: Boolean(parsed.cross_functional) && secondAgent !== null,
          secondAgent,
          reason: typeof parsed.reason === "string" ? parsed.reason : "",
        };
      } catch {
        // keep the safe default
      }
    }

    return NextResponse.json({ ...result, usage: { ...usage, model: GATE_MODEL } });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }
    throw error;
  }
}
