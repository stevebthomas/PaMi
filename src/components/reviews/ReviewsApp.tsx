"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useSimStore } from "@/store/simStore";
import { ScorecardDetail } from "../scorecard/ScorecardDetail";
import type { DayScorecardRecord, GuidanceOpportunity, PlaytestAggregateRecord, PlaytestRecord } from "@/lib/sim/types";

const DIMENSION_LABELS: { key: "responseTime" | "triageQuality" | "commClarity" | "stakeholderMgmt" | "crossFunctional"; label: string }[] = [
  { key: "responseTime", label: "Resp" },
  { key: "triageQuality", label: "Triage" },
  { key: "commClarity", label: "Comm" },
  { key: "stakeholderMgmt", label: "Stake" },
  { key: "crossFunctional", label: "Cross" },
];

interface ScorecardEntry {
  key: string;
  title: string;
  subtitle: string;
  record: DayScorecardRecord | PlaytestRecord | PlaytestAggregateRecord;
  highlight?: boolean;
}

function ScoreRow({ scores }: { scores: DayScorecardRecord["scores"] }) {
  return (
    <div className="grid grid-cols-5 gap-1 text-center text-caption text-text-secondary">
      {DIMENSION_LABELS.map((d) => (
        <div key={d.key}>
          {d.label}
          <br />
          <span className="font-mono tabular-nums text-text-primary">{scores[d.key].toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function EntryCard({ entry, onClick }: { entry: ScorecardEntry; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`mb-3 block w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted ${
        entry.highlight ? "border-accent-green bg-surface" : "border-border-hairline bg-surface"
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className={`text-label font-semibold ${entry.highlight ? "text-accent-green" : "text-text-primary"}`}>
          {entry.title}
        </span>
        <span className="font-mono text-body tabular-nums text-text-primary">{entry.record.overall.toFixed(1)}/10</span>
      </div>
      <div className="mb-2 text-label text-text-secondary">{entry.subtitle}</div>
      <ScoreRow scores={entry.record.scores} />
    </button>
  );
}

/** Lists every completed day's scorecard for this session, most recent
 * first, and lets the player click into any one for the full detail: a
 * "look how you've improved" view. Also lists AI playtester runs (from
 * `npm run playtest`): per-run scorecards, a per-persona aggregate, and
 * the synthesized "guidance opportunities" findings, all clearly
 * separated from the player's own sessions. */
export function ReviewsApp() {
  const dayRecords = useSimStore((s) => s.dayRecords);
  const [playtests, setPlaytests] = useState<(PlaytestRecord | PlaytestAggregateRecord)[]>([]);
  const [guidance, setGuidance] = useState<GuidanceOpportunity[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/playtests")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.playtests) setPlaytests(data.playtests);
        if (data?.guidanceOpportunities?.findings) setGuidance(data.guidanceOpportunities.findings);
      })
      .catch(() => {});
  }, []);

  const yourEntries: ScorecardEntry[] = [...dayRecords]
    .sort((a, b) => b.day - a.day)
    .map((r) => ({ key: `player-${r.day}`, title: `Day ${r.day}`, subtitle: r.scenarioLabel, record: r }));

  const aggregates = playtests.filter((p): p is PlaytestAggregateRecord => p.kind === "aggregate");
  const runs = playtests.filter((p): p is PlaytestRecord => p.kind === "run");

  const aggregateEntries: ScorecardEntry[] = aggregates.map((r) => ({
    key: `agg-${r.persona}`,
    title: r.playtesterLabel,
    subtitle: `Day ${r.day} · ${r.scenarioLabel}`,
    record: r,
    highlight: true,
  }));

  const runEntries: ScorecardEntry[] = [...runs]
    .sort((a, b) => a.persona.localeCompare(b.persona) || a.runIndex - b.runIndex)
    .map((r) => ({
      key: `run-${r.persona}-${r.runIndex}`,
      title: r.playtesterLabel,
      subtitle: `Day ${r.day} · ${r.scenarioLabel}`,
      record: r,
    }));

  const allScorecardEntries = [...yourEntries, ...aggregateEntries, ...runEntries];
  const selectedScorecard = selectedKey ? allScorecardEntries.find((e) => e.key === selectedKey) ?? null : null;
  const showingGuidance = selectedKey === "guidance";

  if (showingGuidance && guidance) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col bg-canvas">
        <div className="flex shrink-0 items-center gap-2 border-b border-border-hairline bg-surface px-3 py-2">
          <button
            onClick={() => setSelectedKey(null)}
            className="flex items-center gap-1 rounded-md border border-border-hairline bg-surface px-2 py-1 text-caption text-text-primary hover:bg-muted"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back
          </button>
          <div className="text-label font-semibold text-text-primary">Guidance opportunities</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-4 text-label italic text-text-secondary">
            Pulled from the &quot;New to product&quot; persona&apos;s reasoning logs across all its runs. Real moments where it
            struggled, hesitated, or hit a knowledge gap, with a suggestion for what kind of ambient signal might help a real
            player in that spot.
          </p>
          {guidance.length === 0 && <p className="text-body text-text-secondary">No findings surfaced.</p>}
          <div className="space-y-3">
            {guidance.map((g, i) => (
              <div key={i} className="rounded-lg border border-accent-green bg-surface p-3 text-label text-text-primary">
                <div className="mb-1 text-caption font-semibold uppercase tracking-wide text-accent-green">{g.moment}</div>
                <p className="mb-2 leading-snug">{g.whatHappened}</p>
                <p className="leading-snug text-text-secondary">
                  <span className="font-semibold text-text-primary">Suggestion: </span>
                  {g.suggestedGuidance}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (selectedScorecard) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col bg-canvas">
        <div className="flex shrink-0 items-center gap-2 border-b border-border-hairline bg-surface px-3 py-2">
          <button
            onClick={() => setSelectedKey(null)}
            className="flex items-center gap-1 rounded-md border border-border-hairline bg-surface px-2 py-1 text-caption text-text-primary hover:bg-muted"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back
          </button>
          <div className="text-label font-semibold text-text-primary">
            {selectedScorecard.title} · {selectedScorecard.subtitle}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ScorecardDetail record={selectedScorecard.record} />
        </div>
      </div>
    );
  }

  if (yourEntries.length === 0 && aggregateEntries.length === 0 && runEntries.length === 0) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-canvas p-6 text-center text-body text-text-secondary">
        No completed days yet. Finish Day 1 to see your first scorecard here.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-canvas p-3">
      {yourEntries.length > 0 && (
        <>
          <div className="mb-2 text-label font-semibold uppercase tracking-wide text-text-secondary">Your sessions</div>
          {yourEntries.map((e) => (
            <EntryCard key={e.key} entry={e} onClick={() => setSelectedKey(e.key)} />
          ))}
        </>
      )}

      {guidance && guidance.length > 0 && (
        <button
          onClick={() => setSelectedKey("guidance")}
          className="mb-3 mt-4 block w-full rounded-lg border border-accent-green bg-accent-green/10 p-3 text-left hover:bg-accent-green/15"
        >
          <div className="flex items-center gap-1.5 text-label font-semibold text-accent-green">
            <Sparkles className="size-3.5" aria-hidden />
            Guidance opportunities
          </div>
          <div className="mt-1 text-label text-text-primary">{guidance.length} finding(s) from novice playtesting. Click to view</div>
        </button>
      )}

      {aggregateEntries.length > 0 && (
        <>
          <div className="mb-2 mt-4 text-label font-semibold uppercase tracking-wide text-accent-green">AI playtest aggregates</div>
          {aggregateEntries.map((e) => (
            <EntryCard key={e.key} entry={e} onClick={() => setSelectedKey(e.key)} />
          ))}
        </>
      )}

      {runEntries.length > 0 && (
        <>
          <div className="mb-2 mt-4 text-label font-semibold uppercase tracking-wide text-text-secondary">Individual playtest runs</div>
          {runEntries.map((e) => (
            <EntryCard key={e.key} entry={e} onClick={() => setSelectedKey(e.key)} />
          ))}
        </>
      )}
    </div>
  );
}
