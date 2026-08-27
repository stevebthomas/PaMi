/**
 * Derives a short list of deterministic, transcript-grounded observations
 * about HOW the player communicated this session, cadence, message length,
 * how question-heavy they were, how quickly they responded. These are meant
 * to let the evaluator frame the wording of its coaching feedback the way a
 * real manager naturally does (a fast, terse, decisive player gets framed
 * differently from a slow, long, deliberative one), WITHOUT ever changing a
 * numeric score.
 *
 * Hard rules this file exists to enforce:
 * - Every observation is a fact directly computed from the transcript (plus
 *   respondedAtMinutes, which is itself derived from the player's own
 *   replies). No psychological inference, no personality labels, just
 *   counts, medians, and timings, with a light qualifier anchored to the
 *   number it describes.
 * - Session-specific only. Nothing here is persisted or turned into a
 *   profile; it's recomputed from scratch each time and passed straight to
 *   the evaluator call.
 * - The output is advisory tone/framing input for the evaluator, never a new
 *   scoring dimension.
 */

import { formatSimClock } from "./timeOfDay";

interface ObservationTranscriptEntry {
  senderId: string;
  content: string;
  sentAtSimMinutes: number;
  channel?: string;
}

export interface SessionObservationInput {
  /** The full transcript so far (every channel/DM), chronological, INCLUDING
   * the player message currently being graded as the last entry. */
  transcript: ObservationTranscriptEntry[];
  /** StateBag.respondedAtMinutes, the sim-clock minute the player satisfied
   * each escalation they responded to. Used only to time the first
   * escalation response against the transcript line that raised it. */
  respondedAtMinutes: Record<string, number>;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/**
 * Returns 0-4 evidence-cited observation strings. Empty when there's nothing
 * meaningful to say (e.g. a single one-word message), so the caller can pass
 * it through untouched and the evaluator simply has no style input for that
 * message.
 */
export function deriveSessionObservations(input: SessionObservationInput): string[] {
  const { transcript, respondedAtMinutes } = input;
  const playerMsgs = transcript.filter((m) => m.senderId === "player");
  const observations: string[] = [];

  if (playerMsgs.length === 0) return observations;

  // 1. Volume + typical length. The median word count is the load-bearing
  //    signal for terse-vs-verbose framing. Deliberately a bare number with no
  //    "terse"/"long-form" verdict attached: in testing, that loaded label
  //    nudged the evaluator's `speed` score (a "long-form" tag read as less
  //    urgent for identical message content). The raw count lets the model
  //    frame length in wording while leaving the score alone.
  const lengths = playerMsgs.map((m) => wordCount(m.content));
  const medianWords = Math.round(median(lengths));
  observations.push(
    `${playerMsgs.length} player message${playerMsgs.length === 1 ? "" : "s"} so far; median length ${medianWords} word${medianWords === 1 ? "" : "s"}.`
  );

  // 2. Question ratio, how much the player is gathering information / asking
  //    vs. asserting. Only worth reporting with at least a couple messages.
  if (playerMsgs.length >= 2) {
    const questionCount = playerMsgs.filter((m) => m.content.includes("?")).length;
    observations.push(
      `${questionCount} of ${playerMsgs.length} player messages ${questionCount === 1 ? "was a question" : "were questions"} (information-gathering vs. asserting a position).`
    );
  }

  // 3. When the player first engaged, as an ABSOLUTE clock time, NOT a
  //    latency delta. This deliberately avoids "N min after it appeared" /
  //    "fast" / "slow" framing: in testing, a response-LATENCY number leaked
  //    into the evaluator's `speed` score (identical message content scored
  //    ~1 point lower when the block said the player was slow to respond),
  //    which violates the tone-only contract. An absolute "first spoke up at
  //    9:40 AM" still lets a note frame cadence in wording ("you engaged later
  //    in the morning") without handing the model a slowness verdict to anchor
  //    a score on. Length + question-ratio alone (above) carry the
  //    decisive-vs-deliberative signal cleanly. Uses respondedAtMinutes when
  //    the player satisfied an escalation, else the player's own first line.
  const escalationResponseMinutes = Object.values(respondedAtMinutes);
  const firstEngagementMinute =
    escalationResponseMinutes.length > 0 ? Math.min(...escalationResponseMinutes) : playerMsgs[0].sentAtSimMinutes;
  observations.push(`First spoke up in the incident at ${formatSimClock(firstEngagementMinute)}.`);

  return observations;
}
