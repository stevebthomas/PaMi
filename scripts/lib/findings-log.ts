/**
 * Generic, persistent cross-run findings tracker — reusable by any
 * diagnostic script (scenario-audit.ts today; nothing here is specific to
 * its finding shape). A "finding" is anything a diagnostic run flags that's
 * worth tracking over time: does it keep coming back, or has it gone away?
 *
 * Deliberately dumb on purpose: this module does no LLM calls and no fuzzy
 * matching. It matches findings ACROSS RUNS purely by the `id` the caller
 * supplies — the caller (and, upstream of it, the analysis prompt) is
 * responsible for giving a finding a short, stable, semantically-meaningful
 * id so that flagging the same underlying issue again naturally produces
 * the same id again. That's a prompting concern, not this module's.
 */
import fs from "node:fs";

export type FindingStatus = "new" | "still-open" | "confirmed-fixed";

export interface FindingsLogEntry {
  id: string;
  /** One-line, human-readable description — what the "at a glance" table
   * and summary line show. Updated to the latest run's wording each time
   * the finding is seen again, so stale phrasing doesn't linger. */
  summary: string;
  status: FindingStatus;
  /** True only on the run where a previously confirmed-fixed finding came
   * back — lets the report call out a regression distinctly from an
   * ordinary "still open" continuation. */
  regressed: boolean;
  firstSeenRun: string;
  lastSeenRun: string;
  /** How many runs have flagged this (consecutive "new"/"still-open" runs
   * plus any regressions) — NOT incremented for confirmed-fixed runs. */
  timesSeen: number;
  history: { run: string; status: FindingStatus }[];
}

export interface FindingsLog {
  entries: FindingsLogEntry[];
}

export interface CurrentFinding {
  id: string;
  summary: string;
}

export interface FindingsLogUpdate {
  log: FindingsLog;
  /** This run's findings, each annotated with its resolved status/history —
   * same order as the `current` array passed in, for the caller to zip back
   * up with its own richer per-finding detail when rendering a report. */
  currentAnnotated: (CurrentFinding & { status: FindingStatus; regressed: boolean; timesSeen: number; firstSeenRun: string })[];
  /** Findings that were open as of the previous run but are absent from
   * `current` this time — i.e. newly confirmed fixed this run. */
  newlyFixed: FindingsLogEntry[];
  /** Every entry still sitting at confirmed-fixed after this run (includes
   * ones fixed in earlier runs, not just this one) — for an optional
   * "previously fixed" appendix. */
  allFixed: FindingsLogEntry[];
}

function loadLog(logPath: string): FindingsLog {
  if (!fs.existsSync(logPath)) return { entries: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    return Array.isArray(parsed.entries) ? parsed : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

/**
 * Reconciles this run's findings against the persistent log at `logPath`,
 * updates it in place on disk, and returns the reconciled view. Call this
 * once per diagnostic run, right after you have the run's finding list.
 */
export function updateFindingsLog(logPath: string, current: CurrentFinding[], runLabel: string): FindingsLogUpdate {
  const log = loadLog(logPath);
  const byId = new Map(log.entries.map((e) => [e.id, e]));
  const currentIds = new Set(current.map((f) => f.id));

  const currentAnnotated: FindingsLogUpdate["currentAnnotated"] = current.map((f) => {
    const existing = byId.get(f.id);
    if (!existing) {
      const entry: FindingsLogEntry = {
        id: f.id,
        summary: f.summary,
        status: "new",
        regressed: false,
        firstSeenRun: runLabel,
        lastSeenRun: runLabel,
        timesSeen: 1,
        history: [{ run: runLabel, status: "new" }],
      };
      byId.set(f.id, entry);
      return { ...f, status: "new", regressed: false, timesSeen: 1, firstSeenRun: runLabel };
    }

    const regressed = existing.status === "confirmed-fixed";
    existing.summary = f.summary;
    existing.status = "still-open";
    existing.regressed = regressed;
    existing.lastSeenRun = runLabel;
    existing.timesSeen += 1;
    existing.history.push({ run: runLabel, status: "still-open" });
    return { ...f, status: "still-open", regressed, timesSeen: existing.timesSeen, firstSeenRun: existing.firstSeenRun };
  });

  const newlyFixed: FindingsLogEntry[] = [];
  for (const entry of byId.values()) {
    if (currentIds.has(entry.id)) continue;
    if (entry.status === "confirmed-fixed") continue;
    entry.status = "confirmed-fixed";
    entry.regressed = false;
    entry.lastSeenRun = runLabel;
    entry.history.push({ run: runLabel, status: "confirmed-fixed" });
    newlyFixed.push(entry);
  }

  const entries = Array.from(byId.values());
  fs.writeFileSync(logPath, JSON.stringify({ entries }, null, 2));

  return {
    log: { entries },
    currentAnnotated,
    newlyFixed,
    allFixed: entries.filter((e) => e.status === "confirmed-fixed"),
  };
}

const STATUS_LABEL: Record<FindingStatus, string> = {
  new: "New",
  "still-open": "Still open",
  "confirmed-fixed": "Confirmed fixed",
};

/** Renders the "at a glance" summary table shared by any diagnostic script
 * using this module — still-open/new first (the stuff worth reading),
 * confirmed-fixed last. */
export function renderFindingsSummaryTable(update: FindingsLogUpdate): string {
  const rows = update.currentAnnotated
    .slice()
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "new" ? -1 : 1))
    .map((f) => {
      const statusText = f.regressed ? `${STATUS_LABEL[f.status]} (regressed)` : STATUS_LABEL[f.status];
      return `| ${statusText} | \`${f.id}\` | ${f.timesSeen} | ${f.firstSeenRun} | ${f.summary} |`;
    });

  const lines = [
    "| Status | ID | Times seen | First seen | Summary |",
    "|---|---|---|---|---|",
    ...rows,
  ];

  if (update.newlyFixed.length > 0) {
    lines.push("", `**Confirmed fixed this run:** ${update.newlyFixed.map((e) => `\`${e.id}\``).join(", ")}`);
  }

  return lines.join("\n");
}
