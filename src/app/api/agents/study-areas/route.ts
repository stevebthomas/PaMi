import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, EVALUATOR_MODEL, extractText, extractUsage } from "@/lib/agents/anthropic";
import { STUDY_AREAS_PROMPT } from "@/lib/agents/prompts";

interface StudyAreasRequestBody {
  questions: { question: string; topicTag: string | null }[];
  coachingNotes: string[];
  knownTopics: { topicKey: string; topicLabel: string }[];
}

interface StudyAreasResult {
  matchedTopicKeys: string[];
  additionalTopics: string[];
}

/**
 * Identifies which curated study_resources topics (plus at most a couple of
 * freeform ones) are worth the player reviewing, based on their Ask Claude
 * questions and the coaching notes from their incident performance. Returns
 * topic KEYS, not prose: the caller looks those up against the curated
 * resource list so links/descriptions are always ours, never invented here.
 */
export async function POST(request: Request) {
  const body: StudyAreasRequestBody = await request.json();
  const { questions, coachingNotes, knownTopics } = body;

  if (questions.length === 0 && coachingNotes.length === 0) {
    return NextResponse.json({ matchedTopicKeys: [], additionalTopics: [] } satisfies StudyAreasResult);
  }

  let client: Anthropic;
  try {
    client = getAnthropicClient();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }

  const questionList = questions.length
    ? questions.map((q, i) => `${i + 1}. "${q.question}"${q.topicTag ? ` (topic: ${q.topicTag})` : ""}`).join("\n")
    : "(none)";
  const notesList = coachingNotes.length ? coachingNotes.map((n, i) => `${i + 1}. ${n}`).join("\n") : "(none)";
  const knownList = knownTopics.map((t) => `- ${t.topicKey}: ${t.topicLabel}`).join("\n");

  const userContent = `QUESTIONS ASKED:\n${questionList}\n\nCOACHING NOTES:\n${notesList}\n\nKNOWN TOPICS:\n${knownList}`;

  try {
    const response = await client.messages.create({
      model: EVALUATOR_MODEL,
      max_tokens: 600,
      system: STUDY_AREAS_PROMPT,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: userContent }],
    });

    const raw = extractText(response);
    const usage = { ...extractUsage(response), model: EVALUATOR_MODEL };
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ matchedTopicKeys: [], additionalTopics: [], usage });
    }
    const parsed = JSON.parse(match[0]);

    const result: StudyAreasResult = {
      matchedTopicKeys: Array.isArray(parsed.matchedTopicKeys) ? parsed.matchedTopicKeys.filter((k: unknown) => typeof k === "string") : [],
      additionalTopics: Array.isArray(parsed.additionalTopics) ? parsed.additionalTopics.filter((t: unknown) => typeof t === "string") : [],
    };

    return NextResponse.json({ ...result, usage });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 500 });
    }
    throw error;
  }
}
