import type { CategoryExplanation, DayScorecardRecord, PlaytestAggregateRecord, PlaytestRecord, ScorecardCategory } from "@/lib/sim/types";
import { CHANNELS } from "@/lib/sim/types";
import { formatSimTime } from "@/store/simStore";

/** One score bar and, when present, the evidence-backed explanation shown
 * directly beneath it (subtask C1). `explanation` is undefined for records
 * that predate the feature / playtests (the flat coaching-notes list renders
 * separately in that fallback case); `explanationLoading` shows a placeholder
 * while the day-end summarizer is still in flight. */
function Bar({
  label,
  score,
  loading,
  explanation,
  explanationLoading,
}: {
  label: string;
  score: number;
  loading?: boolean;
  explanation?: CategoryExplanation | null;
  explanationLoading?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, score * 10));
  const color = score >= 7 ? "bg-accent-pulse" : score >= 4 ? "bg-accent-taskflow" : "bg-accent-danger";
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-label text-ink">
        <span>{label}</span>
        <span className="font-pixel text-label">{loading ? "…" : `${score.toFixed(1)}/10`}</span>
      </div>
      <div className="pixel-border h-3 w-full bg-white">
        {loading ? (
          <div className="h-full w-full animate-pulse bg-ink-soft/30" />
        ) : (
          <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        )}
      </div>
      {explanationLoading && !explanation && (
        <p className="mt-1 text-label italic text-ink-soft">Working out why this landed here…</p>
      )}
      {explanation && explanation.explanation && (
        <div className="mt-1 text-label text-ink">
          <p className="leading-snug">{explanation.explanation}</p>
          {explanation.quotes.length > 0 && (
            <div className="mt-1 space-y-1">
              {explanation.quotes.map((q, i) => (
                <p
                  key={i}
                  className="border-l-2 border-ink-soft pl-2 italic leading-snug text-ink-soft"
                >
                  &ldquo;{q}&rdquo;
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function channelContext(channelId: string): string {
  const channel = CHANNELS.find((c) => c.id === channelId);
  if (!channel) return "in the scenario";
  return channel.kind === "dm" ? `to ${channel.label}` : `in ${channel.label}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

/** Full scorecard body: scores, and (when present) postmortem, coaching
 * notes, areas to study, playtester notes. An aggregate record only has
 * scores (no per-message detail averages meaningfully), so every section
 * past the score bars is optional and simply omitted when its data isn't
 * there. Shared by the end-of-day popup and the Reviews app's detail view. */
export function ScorecardDetail({ record }: { record: DayScorecardRecord | PlaytestRecord | PlaytestAggregateRecord }) {
  const playtesterNotes = "playtesterNotes" in record ? record.playtesterNotes : null;
  const coachingNotes = "coachingNotes" in record ? record.coachingNotes : null;
  const postmortemText = "postmortemText" in record ? record.postmortemText : null;
  const studyAreas = "studyAreas" in record ? record.studyAreas : null;
  const studyAreasLoading = "studyAreasLoading" in record && record.studyAreasLoading;
  const noEngagement = "noEngagement" in record && record.noEngagement;
  const crossFunctionalLoading = "crossFunctionalLoading" in record && record.crossFunctionalLoading;

  // C1: the five per-category, evidence-backed explanations shown under each
  // bar. Present on normal current-day records; absent on zero-engagement
  // days, records that predate the feature, and playtests/*.json, in which
  // case we degrade to the flat COACHING NOTES list below (fallback mode).
  const categoryExplanations =
    "categoryExplanations" in record ? (record.categoryExplanations ?? null) : null;
  const explanationsLoading = "explanationsLoading" in record && Boolean(record.explanationsLoading);
  // "New mode": show per-bar explanations (and suppress the flat notes dump)
  // whenever we have explanations or are still waiting on them. When there are
  // none and nothing is loading (old record / playtest / zero-engagement), we
  // stay in the legacy coaching-notes list so those records still render.
  const useExplanations = explanationsLoading || (categoryExplanations != null && categoryExplanations.length > 0);
  const explanationFor = (category: ScorecardCategory): CategoryExplanation | null =>
    categoryExplanations?.find((e) => e.category === category) ?? null;

  return (
    <>
      <div className="pixel-border mb-4 bg-white p-3 text-center">
        <div className="text-label text-ink-soft">Overall</div>
        <div className="font-pixel text-display text-ink">{crossFunctionalLoading ? "…" : record.overall.toFixed(1)} / 10</div>
        {crossFunctionalLoading && <div className="mt-1 text-label italic text-ink-soft">still grading coordination…</div>}
      </div>

      <Bar
        label="Response time"
        score={record.scores.responseTime}
        explanation={useExplanations ? explanationFor("responseTime") : null}
        explanationLoading={useExplanations && explanationsLoading}
      />
      <Bar
        label="Triage quality"
        score={record.scores.triageQuality}
        explanation={useExplanations ? explanationFor("triageQuality") : null}
        explanationLoading={useExplanations && explanationsLoading}
      />
      <Bar
        label="Communication clarity"
        score={record.scores.commClarity}
        explanation={useExplanations ? explanationFor("commClarity") : null}
        explanationLoading={useExplanations && explanationsLoading}
      />
      <Bar
        label="Stakeholder management"
        score={record.scores.stakeholderMgmt}
        explanation={useExplanations ? explanationFor("stakeholderMgmt") : null}
        explanationLoading={useExplanations && explanationsLoading}
      />
      <Bar
        label="Cross-functional coordination"
        score={record.scores.crossFunctional}
        loading={crossFunctionalLoading}
        explanation={useExplanations ? explanationFor("crossFunctional") : null}
        explanationLoading={useExplanations && explanationsLoading}
      />

      {postmortemText && (
        <div className="pixel-border mt-4 bg-white p-3 text-label text-ink">
          <div className="mb-1 font-pixel text-caption text-ink-soft">YOUR POSTMORTEM</div>
          <p className="whitespace-pre-wrap leading-snug">{postmortemText}</p>
        </div>
      )}

      {/* In new-mode, the flat coaching-notes dump is replaced by the per-bar
          explanations above. The one exception is a post-day follow-through
          note (recordFollowUpTicket, added when the player turns a postmortem
          line into a tracked ticket AFTER the day is recorded, i.e. too late to
          fold into the summarizer); surfaced here so that positive signal
          isn't silently lost. */}
      {useExplanations && coachingNotes && coachingNotes.some((e) => e.messageId === "follow-up-ticket") && (
        <div className="mt-4">
          <div className="mb-1 font-pixel text-caption text-ink-soft">FOLLOW-THROUGH</div>
          <div className="space-y-2">
            {coachingNotes
              .filter((e) => e.messageId === "follow-up-ticket")
              .map((entry) => (
                <div key={entry.id} className="pixel-border bg-white p-3 text-label text-ink">
                  <div className="mb-1 text-label text-ink-soft">
                    {entry.label
                      ? `${entry.label}, ${formatSimTime(entry.sentAtSimMinutes)}`
                      : `Day 1 wrap-up, ${formatSimTime(entry.sentAtSimMinutes)}`}
                  </div>
                  <p className="leading-snug">{entry.feedback}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {!useExplanations && coachingNotes && coachingNotes.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 font-pixel text-caption text-ink-soft">COACHING NOTES</div>
          <div className="space-y-2">
            {coachingNotes.map((entry) => (
              <div key={entry.id} className="pixel-border bg-white p-3 text-label text-ink">
                <div className="mb-1 text-label text-ink-soft">
                  {entry.label
                    ? `${entry.label}, ${formatSimTime(entry.sentAtSimMinutes)}`
                    : entry.messageContent
                      ? `Your message ${channelContext(entry.channel)} at ${formatSimTime(entry.sentAtSimMinutes)}`
                      : `Day 1 wrap-up, ${formatSimTime(entry.sentAtSimMinutes)}`}
                </div>
                {entry.messageContent && (
                  <p className="mb-2 border-l-2 border-ink-soft pl-2 italic leading-snug text-ink-soft">
                    &ldquo;{truncate(entry.messageContent, 140)}&rdquo;
                  </p>
                )}
                <p className="leading-snug">{entry.feedback}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {studyAreasLoading && (
        <div className="mt-4 text-center text-label italic text-ink-soft">
          Thinking about what&apos;s worth exploring next…
        </div>
      )}

      {studyAreas && !studyAreasLoading && studyAreas.length > 0 && (
        <div className="pixel-border mt-4 bg-white p-3 text-label text-ink" style={{ borderColor: "var(--accent-help)" }}>
          <div className="mb-2 font-pixel text-caption text-accent-help">AREAS TO STUDY</div>
          <ul className="space-y-2">
            {studyAreas.map((area, i) => (
              <li key={i}>
                <span className="font-semibold">{area.topicLabel}.</span>
                {area.reason && <span> {area.reason}</span>}
                {area.resources.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {area.resources.map((r) => (
                      <a
                        key={r.url}
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-accent-help underline decoration-dotted hover:text-ink"
                      >
                        {r.source}: {r.title}
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {studyAreas && !studyAreasLoading && studyAreas.length === 0 && (
        noEngagement ? (
          <div className="mt-4 text-center text-label italic text-ink-soft">
            Nothing to study yet. Areas to study are drawn from what you actually did and asked
            today, and there was no engagement to draw from.
          </div>
        ) : (
          <div className="mt-4 text-center text-label italic text-ink-soft">
            Nothing flagged to study today. Nice work staying oriented.
          </div>
        )
      )}

      {playtesterNotes && (
        <div className="pixel-border mt-4 bg-white p-3 text-label text-ink" style={{ borderColor: "var(--accent-reviews)" }}>
          <div className="mb-1 font-pixel text-caption text-accent-reviews">PLAYTESTER NOTES</div>
          <p className="leading-snug">{playtesterNotes}</p>
        </div>
      )}

      {/* Easter-egg display was removed deliberately (tone): Day 1 Complete
          shouldn't undercut itself with achievement tracking. The underlying
          tracking (easterEggsFound, EasterEggDiscovery, the NPC reactions)
          stays; only this panel goes. */}
    </>
  );
}
