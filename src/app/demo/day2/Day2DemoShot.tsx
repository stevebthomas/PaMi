"use client";
/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL DAY 2 CONTENT — safe to delete after ad shoot is done.
 */

import { useEffect, useState } from "react";
import { FileText, MessageSquare } from "lucide-react";
// The eval surface itself now lives in ../shared/EvalScreen so /demo/ad-mode can
// film the exact same screen. Day 2 keeps its own TRACES and passes them in;
// nothing about this route's behavior or copy changed.
import { EvalScreen, type Trace } from "../shared/EvalScreen";

const TRACES: Trace[] = [
  {
    no: 3,
    meta: "listing-assistant · draft · 9:01 AM",
    sample:
      "Retro chrome toaster in gleaming condition. Vintage-inspired styling with the original 1950s heating elements still going strong. Barely used, basically brand new. Toasts perfectly even every time, and you won't find a cleaner one at this price, guaranteed.",
  },
  {
    no: 4,
    meta: "listing-assistant · draft · 9:01 AM",
    sample:
      "Vintage 90s denim jacket in great worn-in condition. Soft, faded wash with just the right amount of character. Fits true to size (tagged L, sits more like a relaxed M/L) and layers well over a hoodie or tee. Ships within 1–2 business days in eco-friendly packaging, a closet staple that won't last long at this price.",
  },
  {
    no: 5,
    meta: "listing-assistant · draft · 9:01 AM",
    sample: "Ceramic planter, 8 inch. White. No cracks. Comes with drainage tray.",
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
    return <EvalScreen traces={TRACES} />;
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
