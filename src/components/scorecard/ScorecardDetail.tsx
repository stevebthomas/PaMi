import type { DayScorecardRecord, PlaytestAggregateRecord, PlaytestRecord } from "@/lib/sim/types";
import { CHANNELS } from "@/lib/sim/types";
import { formatSimTime } from "@/store/simStore";

function Bar({ label, score, loading }: { label: string; score: number; loading?: boolean }) {
  const pct = Math.max(0, Math.min(100, score * 10));
  const color = score >= 7 ? "bg-accent-pulse" : score >= 4 ? "bg-accent-taskflow" : "bg-accent-danger";
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-xs text-ink">
        <span>{label}</span>
        <span className="font-pixel text-[10px]">{loading ? "…" : `${score.toFixed(1)}/10`}</span>
      </div>
      <div className="pixel-border h-3 w-full bg-white">
        {loading ? (
          <div className="h-full w-full animate-pulse bg-ink-soft/30" />
        ) : (
          <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        )}
      </div>
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

/** Full scorecard body — scores, and (when present) postmortem, coaching
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
  const easterEggsFound = "easterEggsFound" in record ? record.easterEggsFound : null;

  return (
    <>
      <div className="pixel-border mb-4 bg-white p-3 text-center">
        <div className="text-[10px] text-ink-soft">Overall</div>
        <div className="font-pixel text-2xl text-ink">{crossFunctionalLoading ? "…" : record.overall.toFixed(1)} / 10</div>
        {crossFunctionalLoading && <div className="mt-1 text-[10px] italic text-ink-soft">still grading coordination…</div>}
      </div>

      <Bar label="Response time" score={record.scores.responseTime} />
      <Bar label="Triage quality" score={record.scores.triageQuality} />
      <Bar label="Communication clarity" score={record.scores.commClarity} />
      <Bar label="Stakeholder management" score={record.scores.stakeholderMgmt} />
      <Bar label="Cross-functional coordination" score={record.scores.crossFunctional} loading={crossFunctionalLoading} />

      {postmortemText && (
        <div className="pixel-border mt-4 bg-white p-3 text-xs text-ink">
          <div className="mb-1 font-pixel text-[9px] text-ink-soft">YOUR POSTMORTEM</div>
          <p className="whitespace-pre-wrap leading-snug">{postmortemText}</p>
        </div>
      )}

      {coachingNotes && coachingNotes.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 font-pixel text-[9px] text-ink-soft">COACHING NOTES</div>
          <div className="space-y-2">
            {coachingNotes.map((entry) => (
              <div key={entry.id} className="pixel-border bg-white p-3 text-xs text-ink">
                <div className="mb-1 text-[10px] text-ink-soft">
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
        <div className="mt-4 text-center text-[11px] italic text-ink-soft">
          Thinking about what&apos;s worth exploring next…
        </div>
      )}

      {studyAreas && !studyAreasLoading && studyAreas.length > 0 && (
        <div className="pixel-border mt-4 bg-white p-3 text-xs text-ink" style={{ borderColor: "var(--accent-help)" }}>
          <div className="mb-2 font-pixel text-[9px] text-accent-help">AREAS TO STUDY</div>
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
          <div className="mt-4 text-center text-[11px] italic text-ink-soft">
            Nothing to study yet. Areas to study are drawn from what you actually did and asked
            today, and there was no engagement to draw from.
          </div>
        ) : (
          <div className="mt-4 text-center text-[11px] italic text-ink-soft">
            Nothing flagged to study today. Nice work staying oriented.
          </div>
        )
      )}

      {playtesterNotes && (
        <div className="pixel-border mt-4 bg-white p-3 text-xs text-ink" style={{ borderColor: "var(--accent-reviews)" }}>
          <div className="mb-1 font-pixel text-[9px] text-accent-reviews">PLAYTESTER NOTES</div>
          <p className="leading-snug">{playtesterNotes}</p>
        </div>
      )}

      {/* Deliberately last, deliberately styled unlike anything above —
          dashed border, no progress bar, no numeric score of any kind.
          This is flavor, not evaluation; nothing here fed the bars up top. */}
      {easterEggsFound && easterEggsFound.length > 0 && (
        <div
          className="mt-4 border-2 border-dashed bg-white p-3 text-xs text-ink"
          style={{ borderColor: "var(--accent-egg)" }}
        >
          <div className="mb-2 font-pixel text-[9px] text-accent-egg">
            EASTER EGGS FOUND: {easterEggsFound.length}
          </div>
          <ul className="space-y-1">
            {easterEggsFound.map((egg) => (
              <li key={egg.id} className="text-ink-soft">
                {egg.label}
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[10px] italic text-ink-soft">Just for fun, doesn&apos;t affect your score.</div>
        </div>
      )}
    </>
  );
}
