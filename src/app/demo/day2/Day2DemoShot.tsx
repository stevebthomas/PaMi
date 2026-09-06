"use client";
/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL DAY 2 CONTENT — safe to delete after ad shoot is done.
 */

import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  MessageSquare,
  X,
} from "lucide-react";

type RuleKey = "rule1" | "rule2" | "rule3" | "rule4";
type RuleVerdict = "pass" | "fail";
type Verdict = "good" | "weak" | "fail";

const RULES: { key: RuleKey; text: string }[] = [
  {
    key: "rule1",
    text: "Does not fabricate brand, model, or condition claims not shown in the photo",
  },
  { key: "rule2", text: "States item condition honestly (wear, damage, functionality)" },
  { key: "rule3", text: "Price suggestion is grounded in comparable recent listings" },
  { key: "rule4", text: "Tone matches BazaarLoop's marketplace voice guidelines" },
];

type Trace = {
  no: number;
  meta: string;
  sample: string;
};

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

const EMPTY_RULE_VERDICTS: Record<RuleKey, RuleVerdict | null> = {
  rule1: null,
  rule2: null,
  rule3: null,
  rule4: null,
};

function EvalScreen() {
  const [visible, setVisible] = useState(false);
  const [traceIndex, setTraceIndex] = useState(0);
  const trace = TRACES[traceIndex];
  const [ruleVerdicts, setRuleVerdicts] =
    useState<Record<RuleKey, RuleVerdict | null>>(EMPTY_RULE_VERDICTS);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [reason, setReason] = useState("");
  const [goodResponse, setGoodResponse] = useState("");

  // Delay the opacity flip a tick after mount so the CSS transition actually runs.
  useEffect(() => {
    const revealTimer = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(revealTimer);
  }, []);

  function goToTrace(index: number) {
    setTraceIndex(index);
    setRuleVerdicts(EMPTY_RULE_VERDICTS);
    setVerdict(null);
    setReason("");
    setGoodResponse("");
  }

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
              AI Eval: Listing Assistant
            </span>
          </div>
          <span className="rounded-full bg-status-pending/15 px-2 py-0.5 text-caption font-semibold uppercase tracking-wide text-status-pending">
            Task · In Progress
          </span>
        </div>

        <div className="bg-canvas p-6">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-label tabular-nums text-text-secondary">
              Reviewing trace <span className="text-text-primary">{trace.no}</span> of 20
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => goToTrace(traceIndex - 1)}
                disabled={traceIndex === 0}
                aria-label="Previous trace"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border-hairline bg-surface text-text-secondary transition-colors hover:bg-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => goToTrace(traceIndex + 1)}
                disabled={traceIndex === TRACES.length - 1}
                aria-label="Next trace"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border-hairline bg-surface text-text-secondary transition-colors hover:bg-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-label font-semibold uppercase tracking-wide text-text-secondary">
              SAMPLE OUTPUT: LISTING ASSISTANT (SELLER PILOT)
            </p>
            <div className="mt-2 rounded-md border border-border-hairline bg-surface p-4">
              <p className="font-pixel text-caption text-text-secondary">{trace.meta}</p>
              <p className="mt-2 text-body leading-relaxed text-text-primary">{trace.sample}</p>
            </div>
          </div>

          <div className="mt-6 divide-y divide-border-hairline rounded-md border border-border-hairline bg-surface">
            {RULES.map((rule) => {
              const ruleVerdict = ruleVerdicts[rule.key];
              return (
                <div
                  key={rule.key}
                  className="flex items-center justify-between gap-4 px-4 py-4"
                >
                  <p className="text-body text-text-primary">{rule.text}</p>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setRuleVerdicts((prev) => ({ ...prev, [rule.key]: "pass" }))
                      }
                      className={`flex items-center gap-1 rounded-md border px-2 py-1 text-label transition-colors ${
                        ruleVerdict === "pass"
                          ? "border-accent-green bg-accent-green/10 font-medium text-accent-green"
                          : "border-border-hairline text-text-secondary hover:bg-muted"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Pass
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRuleVerdicts((prev) => ({ ...prev, [rule.key]: "fail" }))
                      }
                      className={`flex items-center gap-1 rounded-md border px-2 py-1 text-label transition-colors ${
                        ruleVerdict === "fail"
                          ? "border-status-failed bg-status-failed/10 font-medium text-status-failed"
                          : "border-border-hairline text-text-secondary hover:bg-muted"
                      }`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                      Fail
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <p className="text-label font-semibold uppercase tracking-wide text-text-secondary">
              VERDICT
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setVerdict("good")}
                className={`rounded-md border px-4 py-1.5 text-body transition-colors ${
                  verdict === "good"
                    ? "border-accent-green bg-accent-green/10 font-medium text-accent-green"
                    : "border-border-hairline text-text-secondary hover:bg-muted"
                }`}
              >
                Good
              </button>
              <button
                type="button"
                onClick={() => setVerdict("weak")}
                className={`rounded-md border px-4 py-1.5 text-body transition-colors ${
                  verdict === "weak"
                    ? "border-status-pending bg-status-pending/10 font-medium text-status-pending"
                    : "border-border-hairline text-text-secondary hover:bg-muted"
                }`}
              >
                Weak
              </button>
              <button
                type="button"
                onClick={() => setVerdict("fail")}
                className={`rounded-md border px-4 py-1.5 text-body transition-colors ${
                  verdict === "fail"
                    ? "border-status-failed bg-status-failed/10 font-medium text-status-failed"
                    : "border-border-hairline text-text-secondary hover:bg-muted"
                }`}
              >
                Fail
              </button>
            </div>
          </div>

          <div className="mt-6" key={traceIndex}>
            <p className="text-label font-semibold uppercase tracking-wide text-text-secondary">
              REASON
            </p>
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="One line: why this verdict"
              className="mt-2 w-full rounded-md border border-border-hairline bg-surface p-3 text-body text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/60"
            />

            <p className="mt-4 text-label font-semibold uppercase tracking-wide text-text-secondary">
              WHAT A GOOD RESPONSE WOULD LOOK LIKE
            </p>
            <textarea
              rows={3}
              value={goodResponse}
              onChange={(event) => setGoodResponse(event.target.value)}
              placeholder="Sketch the listing copy the assistant should have produced…"
              className="mt-2 w-full resize-y rounded-md border border-border-hairline bg-surface p-3 text-body text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/60"
            />
          </div>

          <div className="mt-6 flex items-center justify-between">
            <p className="font-pixel text-caption text-text-secondary tabular-nums">
              EVAL-0042 · model: listing-assistant-v0.3 · trace {trace.no}/20
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
