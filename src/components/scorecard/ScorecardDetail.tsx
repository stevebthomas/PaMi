import type { CategoryExplanation, DayScorecardRecord, PlaytestAggregateRecord, PlaytestRecord, ScorecardCategory } from "@/lib/sim/types";
import { CHANNELS } from "@/lib/sim/types";
import { formatSimTime } from "@/store/simStore";
import { cn } from "@/lib/utils";

/** One score bar and, when present, the evidence-backed explanation shown
 * directly beneath it (subtask C1). `explanation` is undefined for records
 * that predate the feature / playtests (the flat coaching-notes list renders
 * separately in that fallback case); `explanationLoading` shows a placeholder
 * while the day-end summarizer is still in flight. `index` only staggers the
 * fill animation; it carries no scoring meaning. */
function Bar({
  label,
  score,
  loading,
  explanation,
  explanationLoading,
  index = 0,
}: {
  label: string;
  score: number;
  loading?: boolean;
  explanation?: CategoryExplanation | null;
  explanationLoading?: boolean;
  index?: number;
}) {
  const pct = Math.max(0, Math.min(100, score * 10));
  // Same score bands as before (>=7 / >=4), now mapped onto the DESIGN.md
  // status tokens: strong reads accent-green, mid reads status-pending amber,
  // low reads status-failed red.
  const fill = score >= 7 ? "bg-accent-green" : score >= 4 ? "bg-status-pending" : "bg-status-failed";
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-body text-text-primary">{label}</span>
        <span className="text-label font-semibold tabular-nums text-text-secondary">
          {loading ? "…" : `${score.toFixed(1)}/10`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {loading ? (
          <div className="h-full w-full animate-pulse rounded-full bg-muted-foreground/40" />
        ) : (
          <div
            className={cn("h-full rounded-full animate-scorecard-fill", fill)}
            style={{ width: `${pct}%`, animationDelay: `${index * 80}ms` }}
          />
        )}
      </div>
      {explanationLoading && !explanation && (
        <p className="mt-1.5 text-label italic text-text-secondary">Working out why this landed here…</p>
      )}
      {explanation && explanation.explanation && (
        <div className="mt-1.5 text-label text-text-primary">
          <p className="leading-snug">{explanation.explanation}</p>
          {explanation.quotes.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {explanation.quotes.map((q, i) => (
                <p
                  key={i}
                  className="border-l-2 border-border-hairline pl-2.5 italic leading-snug text-text-secondary"
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
      <div className="mb-5 rounded-[var(--radius-card)] border border-border-hairline bg-surface p-4">
        <div className="text-label text-text-secondary">Overall</div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-5xl font-semibold leading-none tracking-tight tabular-nums text-text-primary">
            {crossFunctionalLoading ? "…" : record.overall.toFixed(1)}
          </span>
          <span className="text-heading font-medium tabular-nums text-text-secondary">/10</span>
        </div>
        {crossFunctionalLoading && <div className="mt-2 text-label italic text-text-secondary">still grading coordination…</div>}
      </div>

      <Bar
        label="Response time"
        score={record.scores.responseTime}
        explanation={useExplanations ? explanationFor("responseTime") : null}
        explanationLoading={useExplanations && explanationsLoading}
        index={0}
      />
      <Bar
        label="Triage quality"
        score={record.scores.triageQuality}
        explanation={useExplanations ? explanationFor("triageQuality") : null}
        explanationLoading={useExplanations && explanationsLoading}
        index={1}
      />
      <Bar
        label="Communication clarity"
        score={record.scores.commClarity}
        explanation={useExplanations ? explanationFor("commClarity") : null}
        explanationLoading={useExplanations && explanationsLoading}
        index={2}
      />
      <Bar
        label="Stakeholder management"
        score={record.scores.stakeholderMgmt}
        explanation={useExplanations ? explanationFor("stakeholderMgmt") : null}
        explanationLoading={useExplanations && explanationsLoading}
        index={3}
      />
      <Bar
        label="Cross-functional coordination"
        score={record.scores.crossFunctional}
        loading={crossFunctionalLoading}
        explanation={useExplanations ? explanationFor("crossFunctional") : null}
        explanationLoading={useExplanations && explanationsLoading}
        index={4}
      />

      {postmortemText && (
        <div className="mt-4 rounded-[var(--radius-card)] border border-border-hairline bg-surface p-3 text-label text-text-primary">
          <div className="mb-1.5 text-caption font-semibold tracking-wide text-text-secondary">YOUR POSTMORTEM</div>
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
          <div className="mb-1.5 text-caption font-semibold tracking-wide text-text-secondary">FOLLOW-THROUGH</div>
          <div className="space-y-2">
            {coachingNotes
              .filter((e) => e.messageId === "follow-up-ticket")
              .map((entry) => (
                <div key={entry.id} className="rounded-[var(--radius-card)] border border-border-hairline bg-surface p-3 text-label text-text-primary">
                  <div className="mb-1 text-label text-text-secondary">
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
          <div className="mb-1.5 text-caption font-semibold tracking-wide text-text-secondary">COACHING NOTES</div>
          <div className="space-y-2">
            {coachingNotes.map((entry) => (
              <div key={entry.id} className="rounded-[var(--radius-card)] border border-border-hairline bg-surface p-3 text-label text-text-primary">
                <div className="mb-1 text-label text-text-secondary">
                  {entry.label
                    ? `${entry.label}, ${formatSimTime(entry.sentAtSimMinutes)}`
                    : entry.messageContent
                      ? `Your message ${channelContext(entry.channel)} at ${formatSimTime(entry.sentAtSimMinutes)}`
                      : `Day 1 wrap-up, ${formatSimTime(entry.sentAtSimMinutes)}`}
                </div>
                {entry.messageContent && (
                  <p className="mb-2 border-l-2 border-border-hairline pl-2.5 italic leading-snug text-text-secondary">
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
        <div className="mt-4 text-center text-label italic text-text-secondary">
          Thinking about what&apos;s worth exploring next…
        </div>
      )}

      {studyAreas && !studyAreasLoading && studyAreas.length > 0 && (
        <div className="mt-4 rounded-[var(--radius-card)] border border-border-hairline bg-surface p-3 text-label text-text-primary">
          <div className="mb-2 text-caption font-semibold tracking-wide text-text-secondary">AREAS TO STUDY</div>
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
                        className="block text-accent-green underline decoration-dotted hover:text-text-primary"
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
          <div className="mt-4 text-center text-label italic text-text-secondary">
            Nothing to study yet. Areas to study are drawn from what you actually did and asked
            today, and there was no engagement to draw from.
          </div>
        ) : (
          <div className="mt-4 text-center text-label italic text-text-secondary">
            Nothing flagged to study today. Nice work staying oriented.
          </div>
        )
      )}

      {playtesterNotes && (
        <div className="mt-4 rounded-[var(--radius-card)] border border-border-hairline bg-surface p-3 text-label text-text-primary">
          <div className="mb-1.5 text-caption font-semibold tracking-wide text-text-secondary">PLAYTESTER NOTES</div>
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
