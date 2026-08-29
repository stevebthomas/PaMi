import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, getPersonaModel, extractText, extractUsage, stripEmDashes } from "@/lib/agents/anthropic";
import { AGENT_SYSTEM_PROMPTS, moodContextLine, reactionContextLine, easterEggReactionLine, groundingContextLine } from "@/lib/agents/prompts";
import type { AgentId, Message, StateBag } from "@/lib/sim/types";

interface ReplyRequestBody {
  agentId: AgentId;
  /** Now carries each message's `sentAtSimMinutes` alongside sender/content.
   * Consumed by an upcoming subtask (A3/A4) that makes NPC replies aware of
   * how long ago things were said; the current prompt assembly ignores it. */
  history: Pick<Message, "senderId" | "content" | "sentAtSimMinutes">[];
  state: StateBag;
  /** Current sim-clock minute at send time. Threaded through for the upcoming
   * elapsed-time-awareness subtask (A3/A4); unused by prompt assembly today. */
  clockMinutes?: number;
  /** Present participants (AgentIds) in the channel being replied in — see
   * presentInChannel in src/lib/sim/roster.ts. For the upcoming channel-roster
   * injection subtask (A3/A4); unused by prompt assembly today. */
  channelRoster?: AgentId[];
  /** Set only for a triggered agent-to-agent reaction call — appends that
   * persona's "how I react to another agent" instruction on top of the
   * normal prompt. Absent (the common case) means the lean, ordinary
   * player-facing prompt, unpadded. */
  reactingTo?: AgentId;
  /** Set only for the one reply immediately following an easter-egg
   * discovery (see ScenarioEvent.easterEgg) — nudges tone only, never
   * content requirements, and has nothing to do with scoring. */
  easterEggDiscovered?: boolean;
  /** A different channel's real transcript this agent has independent
   * visibility into (e.g. Derek watching #incidents) — see
   * groundingContextLine. Absent for the common case (an agent who only
   * knows what's been said directly to them). */
  groundingChannelLabel?: string;
  groundingTranscript?: { senderId: string; content: string }[];
  /** A pre-built, caller-supplied block of established state appended to the
   * system prompt as-is (e.g. the assigned engineer's live fix status — see
   * buildEngineerPersonaContext in dmContacts.ts). Kept generic here: the
   * route just concatenates whatever grounded context the caller assembled,
   * it doesn't know or care that it's about the fix. */
  personaContext?: string;
}

/**
 * Generates one in-character Slack-style reply from an NPC (Raj, Priya, or Derek),
 * given the message history in the current channel/DM and the sim's state bag.
 * This is what makes the personas react to what the player actually wrote,
 * instead of only ever posting the fixed scripted lines.
 */
export async function POST(request: Request) {
  const body: ReplyRequestBody = await request.json();
  const {
    agentId,
    history,
    state,
    reactingTo,
    easterEggDiscovered,
    groundingChannelLabel,
    groundingTranscript,
    personaContext,
    clockMinutes,
    channelRoster,
  } = body;

  // clockMinutes, channelRoster, and each history entry's sentAtSimMinutes are
  // now received and typed here, but deliberately NOT wired into prompt
  // assembly in this subtask — an upcoming subtask (A3/A4) injects elapsed-time
  // and channel-roster context into the persona prompts. Referenced via `void`
  // so they're provably parsed/available now without changing any model-visible
  // output. Do not fold them into the `system` string below.
  void clockMinutes;
  void channelRoster;

  const systemPrompt = AGENT_SYSTEM_PROMPTS[agentId];
  if (!systemPrompt) {
    return NextResponse.json({ error: `No persona configured for agent "${agentId}"` }, { status: 400 });
  }

  let client: Anthropic;
  try {
    client = getAnthropicClient();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }

  // Only bracket-prefix messages from a THIRD party (e.g. Priya's line inside Raj's
  // #incidents history) so the model can tell voices apart. The agent's own past
  // turns and the player's turns are sent as-is — prefixing the agent's own turns
  // taught it to echo "[agentId]: " into its next reply.
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.senderId === agentId ? "assistant" : "user",
    content:
      m.senderId === agentId || m.senderId === "player" ? m.content : `[${m.senderId}]: ${m.content}`,
  }));

  try {
    const reactionLine = reactingTo ? reactionContextLine(agentId, reactingTo) : "";
    const eggLine = easterEggDiscovered ? easterEggReactionLine() : "";
    const groundingLine =
      groundingChannelLabel && groundingTranscript ? groundingContextLine(groundingChannelLabel, groundingTranscript) : "";
    const personaLine = personaContext ?? "";
    const response = await client.messages.create({
      model: getPersonaModel(agentId),
      max_tokens: 900,
      system: systemPrompt + moodContextLine(agentId, state) + reactionLine + eggLine + groundingLine + personaLine,
      messages,
    });

    return NextResponse.json({
      content: stripEmDashes(extractText(response)),
      usage: { ...extractUsage(response), model: getPersonaModel(agentId) },
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }
    throw error;
  }
}
