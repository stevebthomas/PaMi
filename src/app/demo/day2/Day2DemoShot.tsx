"use client";
/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL DAY 2 CONTENT — safe to delete after ad shoot is done.
 */

import { useEffect, useState } from "react";

const CRITERIA: { key: string; name: string; desc: string }[] = [
  { key: "accuracy", name: "Accuracy", desc: "Factually consistent with the scenario state." },
  { key: "relevance", name: "Relevance / Helpfulness", desc: "Addresses the player's actual question." },
  { key: "tone", name: "Tone / UX fit", desc: "Sounds like Priya; fits the sim's register." },
  { key: "safety", name: "Safety", desc: "No harmful, off-policy, or immersion-breaking content." },
];

function TransitionScreen({ filled }: { filled: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas p-6">
      <p className="text-caption font-semibold uppercase tracking-wide text-text-secondary">
        BAZAARLOOP
      </p>
      <h1 className="text-display font-bold tracking-tight text-text-primary">Day 2</h1>
      <p className="font-pixel text-label text-text-secondary tabular-nums">Tuesday · 9:02 AM</p>
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

function EvalScreen() {
  const [visible, setVisible] = useState(false);
  const [scores, setScores] = useState<Record<string, number | null>>({
    accuracy: null,
    relevance: null,
    tone: null,
    safety: null,
  });

  // Delay the opacity flip a tick after mount so the CSS transition actually runs.
  useEffect(() => {
    const revealTimer = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(revealTimer);
  }, []);

  return (
    <div
      className={`flex min-h-screen items-center justify-center bg-canvas p-6 transition-opacity duration-500 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="w-full max-w-2xl rounded-lg border border-border-hairline bg-surface p-8">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-secondary">
          TASKFLOW · EVAL TASK
        </p>
        <h1 className="mt-1 text-heading font-bold tracking-tight text-text-primary">
          AI Response Evaluation
        </h1>
        <p className="mt-2 text-body text-text-secondary">
          Evaluate the new NPC response quality for the Priya persona. Score the sample below
          against each criterion.
        </p>

        <div className="mt-6">
          <p className="text-label font-semibold uppercase tracking-wide text-text-secondary">
            SAMPLE OUTPUT — PRIYA (OPERATIONS &amp; SUPPORT LEAD)
          </p>
          <div className="mt-2 rounded-md border border-border-hairline bg-canvas p-4">
            <p className="font-pixel text-caption text-text-secondary">priya · #support · 9:04 AM</p>
            <p className="mt-2 text-body leading-relaxed text-text-primary">
              Support tickets spiked right after the checkout fix went out &mdash; mostly refund
              requests from customers who got double-charged during the rollout window.
              I&apos;ve triaged about forty of them so far, but I need your call on whether we
              auto-refund the whole batch or hold for manual review. Which way do you want me to
              prioritize this?
            </p>
          </div>
        </div>

        <div className="mt-6 divide-y divide-border-hairline">
          {CRITERIA.map((criterion) => (
            <div key={criterion.key} className="flex items-center justify-between gap-4 py-4">
              <div>
                <p className="text-body font-medium text-text-primary">{criterion.name}</p>
                <p className="text-label text-text-secondary">{criterion.desc}</p>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const selected = scores[criterion.key] === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() =>
                        setScores((prev) => ({ ...prev, [criterion.key]: n }))
                      }
                      className={`h-8 w-8 rounded-md border text-label tabular-nums transition-colors ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border-hairline text-text-primary hover:bg-canvas"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <p className="text-label font-semibold uppercase tracking-wide text-text-secondary">
            NOTES / RATIONALE
          </p>
          <textarea
            rows={4}
            placeholder="Explain your scores — cite specific lines from the sample…"
            className="mt-2 w-full rounded-md border border-border-hairline bg-surface p-3 text-body text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="font-pixel text-caption text-text-secondary tabular-nums">
            EVAL-0042 · persona: priya-v2
          </p>
          <button
            type="button"
            className="rounded-md bg-primary px-6 py-3 text-body font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

function Day2Take() {
  const [phase, setPhase] = useState<"transition" | "eval">("transition");
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    // Start the width transition a beat after mount so the browser paints the
    // 0% state first, otherwise the transition to 100% never animates.
    const startFillTimer = setTimeout(() => setFilled(true), 50);
    const advancePhaseTimer = setTimeout(() => setPhase("eval"), 4000);
    return () => {
      clearTimeout(startFillTimer);
      clearTimeout(advancePhaseTimer);
    };
  }, []);

  if (phase === "eval") {
    return <EvalScreen />;
  }
  return <TransitionScreen filled={filled} />;
}

export default function Day2DemoShot() {
  const [takeKey, setTakeKey] = useState(0);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "r" && event.key !== "R") return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      setTakeKey((prev) => prev + 1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <Day2Take key={takeKey} />
      <p className="pointer-events-none fixed bottom-4 right-4 text-caption text-text-secondary opacity-50">
        press &quot;r&quot; to replay · demo scaffolding
      </p>
    </>
  );
}
