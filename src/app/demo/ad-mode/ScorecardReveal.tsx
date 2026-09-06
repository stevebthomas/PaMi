"use client";
/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL AD/GAME CONTENT — safe to delete after ad shoot is done.
 *
 * Two full-screen overlays for the back half of the ad: the day-end scorecard
 * reveal and the Day 2 transition card.
 *
 * The scorecard mirrors DayScorecard/ScorecardDetail's layout, but every score
 * below is a FIXED FAKE NUMBER chosen for the shoot (overall 6.5/10). Hardcoded
 * for filming, no real logic: nothing was graded, nothing was evaluated, there
 * is no record behind this screen.
 */

import { useEffect, useState } from "react";

type Category = { label: string; score: number };

/** Fixed fake numbers for filming. Not computed, not derived, not graded. */
const CATEGORIES: Category[] = [
  { label: "Tone", score: 7 },
  { label: "Speed", score: 6 },
  { label: "Completeness", score: 6 },
  { label: "Strategic Thinking", score: 7 },
];

/** Fixed fake overall for filming. Deliberately NOT the mean of the bars. */
const OVERALL = "6.5";

const BAR_STAGGER_MS = 250;
const BAR_DURATION_MS = 700;
/** Overall lands after the last bar has finished travelling. */
const OVERALL_DELAY_MS = CATEGORIES.length * BAR_STAGGER_MS + BAR_DURATION_MS - 200;

function fillColor(score: number): string {
  // Same score bands the real ScorecardDetail uses.
  return score >= 7 ? "bg-accent-green" : score >= 4 ? "bg-status-pending" : "bg-status-failed";
}

export function ScorecardReveal() {
  const [revealed, setRevealed] = useState(false);

  // Paint the 0% / opacity-0 state once, then flip a tick later so the CSS
  // transitions actually run.
  useEffect(() => {
    const revealTimer = setTimeout(() => setRevealed(true), 40);
    return () => clearTimeout(revealTimer);
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-card)] border border-border-hairline bg-surface shadow-lg">
        <div className="shrink-0 border-b border-border-hairline px-5 py-4">
          <div className="text-subheading font-semibold tracking-tight text-text-primary">
            Day 1 complete
          </div>
          <div className="mt-0.5 text-label text-text-secondary">
            Scorecard: Apple Pay checkout incident
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-canvas p-5">
          {CATEGORIES.map((category, index) => (
            <div key={category.label} className="mb-4">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-body text-text-primary">{category.label}</span>
                <span className="text-label font-semibold tabular-nums text-text-secondary">
                  {category.score}/10
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-[width] ease-out ${fillColor(
                    category.score,
                  )}`}
                  style={{
                    width: revealed ? `${category.score * 10}%` : "0%",
                    transitionDuration: `${BAR_DURATION_MS}ms`,
                    transitionDelay: `${index * BAR_STAGGER_MS}ms`,
                  }}
                />
              </div>
            </div>
          ))}

          <div
            className="mt-5 rounded-[var(--radius-card)] border border-border-hairline bg-surface p-4 transition-opacity duration-500"
            style={{
              opacity: revealed ? 1 : 0,
              transitionDelay: `${OVERALL_DELAY_MS}ms`,
            }}
          >
            <div className="text-label text-text-secondary">Overall</div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-pixel text-display tabular-nums leading-none tracking-tight text-text-primary">
                {OVERALL}
              </span>
              <span className="text-heading font-medium tabular-nums text-text-secondary">/10</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Day 2 card. Same visual pattern as the day2 shot's TransitionScreen, but
 * static: it never auto-advances, the operator steps past it on ArrowLeft.
 */
export function Day2Transition() {
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    const startFillTimer = setTimeout(() => setFilled(true), 50);
    return () => clearTimeout(startFillTimer);
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-canvas p-6">
      <p className="text-caption font-semibold uppercase tracking-wide text-text-secondary">
        BAZAARLOOP
      </p>
      <h1 className="text-display font-bold tracking-tight text-text-primary">Day 2</h1>
      <p className="font-pixel text-label tabular-nums text-text-secondary">Tuesday · 9:00 AM</p>
      <p className="text-body text-text-secondary">Loading your workspace…</p>
      <div className="mt-4 h-1.5 w-64 overflow-hidden rounded-full bg-border-hairline">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-[3500ms] ease-out"
          style={{ width: filled ? "100%" : "0%" }}
        />
      </div>
    </div>
  );
}
