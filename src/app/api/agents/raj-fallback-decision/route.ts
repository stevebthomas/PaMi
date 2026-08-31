import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, RAJ_FALLBACK_MODEL, extractText, extractUsage, stripEmDashes } from "@/lib/agents/anthropic";
import { RAJ_FALLBACK_DECISION_PROMPT } from "@/lib/agents/prompts";

/**
 * Raj's OWN reasoned fallback call on the rollback-vs-patch-forward fix, made
 * when the player went quiet and he has to decide himself before Derek's 10:20
 * escalation. See RAJ_FALLBACK_DECISION_PROMPT for why this is a genuine model
 * judgment (reasoned variability) rather than a hardcoded default: two good
 * engineers given identical facts land differently, so both choices must be
 * reachable and neither nudged.
 *
 * The whole scenario is fixed, so this route needs no request body: it's
 * callable with `{}` and every call is the same request, with variability
 * coming from sampling. Uses RAJ_FALLBACK_MODEL (Sonnet, not the Haiku persona
 * tier) because Haiku collapses to a framing-driven mode on this knife-edge
 * tradeoff instead of genuinely deliberating (see that constant's note).
 * Default temperature (1.0) is intentional: we WANT run-to-run variation on a
 * real judgment call.
 */
export async function POST() {
  let client: Anthropic;
  try {
    client = getAnthropicClient();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }

  const model = RAJ_FALLBACK_MODEL;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 400,
      system: RAJ_FALLBACK_DECISION_PROMPT,
      messages: [
        {
          role: "user",
          content:
            "You can't reach the PM and Derek's waiting. Make the fix call now and reply with only the JSON.",
        },
      ],
    });

    const raw = extractText(response);
    const usage = { ...extractUsage(response), model };
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: "Raj fallback decision returned no parseable JSON" }, { status: 502 });
    }
    const parsed = JSON.parse(match[0]);
    const choice = parsed.choice === "rollback" || parsed.choice === "patch-forward" ? parsed.choice : null;
    if (!choice || typeof parsed.reasoning !== "string" || typeof parsed.derekLine !== "string") {
      return NextResponse.json({ error: "Raj fallback decision was malformed" }, { status: 502 });
    }

    // Defensive net only: the prompt already forbids em-dashes, but this
    // content is relayed verbatim into player-facing Slack messages, so
    // guarantee the house style rather than trusting the model every time.
    return NextResponse.json({
      choice,
      reasoning: stripEmDashes(parsed.reasoning),
      derekLine: stripEmDashes(parsed.derekLine),
      usage,
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }
    throw error;
  }
}
