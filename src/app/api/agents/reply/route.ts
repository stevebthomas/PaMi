import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, getPersonaModel, extractText, extractUsage, stripEmDashes } from "@/lib/agents/anthropic";
import {
  AGENT_SYSTEM_PROMPTS,
  moodContextLine,
  commitmentContextLine,
  rosterContextLine,
  elapsedTimeContextLine,
  reactionContextLine,
  easterEggReactionLine,
  groundingContextLine,
} from "@/lib/agents/prompts";
import type { AgentId, Message, StateBag } from "@/lib/sim/types";

interface ReplyRequestBody {
  agentId: AgentId;
  /** Carries each message's `sentAtSimMinutes` alongside sender/content —
   * elapsedTimeContextLine reads this to find the replying agent's own most
   * recent message and how long ago it was. */
  history: Pick<Message, "senderId" | "content" | "sentAtSimMinutes">[];
  state: StateBag;
  /** Current sim-clock minute at send time — fed to elapsedTimeContextLine
   * alongside `history` to compute the elapsed-time-awareness context (A4). */
  clockMinutes?: number;
  /** Present participants (AgentIds) in the channel being replied in — see
   * presentInChannel in src/lib/sim/roster.ts. Fed to rosterContextLine (A3)
   * so a persona knows who else is in the room and can address them directly
   * instead of talking about them in the third person. */
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
    const rosterLine = rosterContextLine(agentId, channelRoster);
    const elapsedLine = elapsedTimeContextLine(agentId, clockMinutes, history);
    const response = await client.messages.create({
      model: getPersonaModel(agentId),
      max_tokens: 900,
      system:
        systemPrompt +
        moodContextLine(agentId, state) +
        commitmentContextLine(agentId, state) +
        rosterLine +
        elapsedLine +
        reactionLine +
        eggLine +
        groundingLine +
        personaLine,
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
