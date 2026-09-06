"use client";
/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL DAY 2 CONTENT — safe to delete after ad shoot is done.
 */

import { useEffect, useState } from "react";
import { ClipboardCheck, FileText, MessageSquare } from "lucide-react";

const CRITERIA: { key: string; name: string; desc: string }[] = [
  { key: "accuracy", name: "Accuracy", desc: "Matches the item details the seller provided." },
  { key: "relevance", name: "Relevance / Helpfulness", desc: "Copy a seller would actually ship." },
  { key: "tone", name: "Tone / UX fit", desc: "Sounds like BazaarLoop, not generic AI." },
  {
    key: "safety",
    name: "Safety",
    desc: "No claims, pricing, or content that could mislead buyers.",
  },
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

function MessageScreen({ onOpenEval }: { onOpenEval: () => void }) {
  const [visible, setVisible] = useState(false);

  // Delay the opacity flip a tick after mount so the CSS transition actually runs.
  useEffect(() => {
    const revealTimer = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(revealTimer);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div
        className={`flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border-hairline bg-surface shadow-lg transition-opacity duration-500 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border-hairline bg-gradient-to-b from-canvas to-[color-mix(in_srgb,var(--accent-green)_4%,var(--canvas))] px-3 py-2">
          <div className="flex items-center gap-2 text-text-secondary">
            <MessageSquare className="h-4 w-4" aria-hidden />
            <span className="text-label font-semibold text-text-primary">CHATTR</span>
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-label font-semibold text-text-secondary">
              D
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-body font-semibold text-text-primary">Derek</span>
                <span className="font-pixel text-caption text-text-secondary tabular-nums">
                  9:02 AM
                </span>
              </div>
              <p className="mt-1 text-body leading-relaxed text-text-primary">
                Hey &mdash; can you get the AI eval in for the listing assistant we&apos;re
                piloting? Whenever you get a sec.
              </p>
              <button
                type="button"
                onClick={onOpenEval}
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border-hairline bg-surface px-2 py-1 text-label text-text-primary transition-colors hover:bg-muted"
              >
                <FileText className="size-3.5 text-text-secondary" aria-hidden />
                AI Eval — Listing Assistant
              </button>
            </div>
          </div>
        </div>
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
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div
        className={`flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border-hairline bg-surface shadow-lg transition-opacity duration-500 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="h-0.5 shrink-0 bg-primary" />
        <div className="flex items-center justify-between border-b border-border-hairline bg-gradient-to-b from-canvas to-[color-mix(in_srgb,var(--accent-green)_4%,var(--canvas))] px-3 py-2">
          <div className="flex items-center gap-2 text-text-secondary">
            <ClipboardCheck className="h-4 w-4" aria-hidden />
            <span className="text-label font-semibold text-text-primary">
              AI Eval — Listing Assistant
            </span>
          </div>
          <span className="rounded-full bg-status-pending/15 px-2 py-0.5 text-caption font-semibold uppercase tracking-wide text-status-pending">
            Task · In Progress
          </span>
        </div>

        <div className="bg-canvas p-6">
          <p className="text-body text-text-secondary">
            Evaluate the listing assistant&apos;s draft output for the seller pilot. Score the
            sample below against each criterion.
          </p>

          <div className="mt-6">
            <p className="text-label font-semibold uppercase tracking-wide text-text-secondary">
              SAMPLE OUTPUT — LISTING ASSISTANT (SELLER PILOT)
            </p>
            <div className="mt-2 rounded-md border border-border-hairline bg-surface p-4">
              <p className="font-pixel text-caption text-text-secondary">
                listing-assistant · draft · 9:01 AM
              </p>
              <p className="mt-2 text-body leading-relaxed text-text-primary">
                Vintage 90s denim jacket in great worn-in condition &mdash; soft, faded wash with
                just the right amount of character. Fits true to size (tagged L, sits more like a
                relaxed M/L) and layers well over a hoodie or tee. Ships within 1&ndash;2 business
                days in eco-friendly packaging &mdash; a closet staple that won&apos;t last long
                at this price.
              </p>
            </div>
          </div>

          <div className="mt-6 divide-y divide-border-hairline rounded-md border border-border-hairline bg-surface">
            {CRITERIA.map((criterion) => (
              <div
                key={criterion.key}
                className="flex items-center justify-between gap-4 px-4 py-4"
              >
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
              className="mt-2 min-h-24 w-full resize-y rounded-md border border-border-hairline bg-surface p-3 text-body text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/60"
            />
          </div>

          <div className="mt-6 flex items-center justify-between">
            <p className="font-pixel text-caption text-text-secondary tabular-nums">
              EVAL-0042 · model: listing-assistant-v0.3
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
    </div>
  );
}

function Day2Take() {
  const [phase, setPhase] = useState<"transition" | "message" | "eval">("transition");
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    // Start the width transition a beat after mount so the browser paints the
    // 0% state first, otherwise the transition to 100% never animates.
    const startFillTimer = setTimeout(() => setFilled(true), 50);
    const advancePhaseTimer = setTimeout(() => setPhase("message"), 4000);
    return () => {
      clearTimeout(startFillTimer);
      clearTimeout(advancePhaseTimer);
    };
  }, []);

  if (phase === "eval") {
    return <EvalScreen />;
  }
  if (phase === "message") {
    return <MessageScreen onOpenEval={() => setPhase("eval")} />;
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
