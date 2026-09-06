"use client";
/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL AD/GAME CONTENT — safe to delete after ad shoot is done.
 *
 * macOS-style notification stack. Every banner shown here is pushed by the
 * script in script.ts: hardcoded for filming, no real logic, no notification
 * system behind it. The engine owns the timing (2600ms auto-dismiss, 300ms
 * fade/slide out) and clears the whole stack on reset.
 */

import { useEffect, useState } from "react";
import { Activity, MessageSquare } from "lucide-react";
import type { BannerApp } from "./script";

export type BannerItem = {
  id: number;
  app: BannerApp;
  sender: string;
  preview: string;
  /** Flipped by the engine ~300ms before removal so the exit can animate. */
  leaving: boolean;
};

function Banner({ item }: { item: BannerItem }) {
  const [entered, setEntered] = useState(false);

  // Same trick the day2 shot uses: paint the off state once, then flip a tick
  // later so the CSS transition actually runs.
  useEffect(() => {
    const enterTimer = setTimeout(() => setEntered(true), 20);
    return () => clearTimeout(enterTimer);
  }, []);

  const Icon = item.app === "pulse" ? Activity : MessageSquare;
  const visible = entered && !item.leaving;

  return (
    <div
      className={`flex w-[340px] items-start gap-3 rounded-xl border border-border-hairline bg-surface/95 p-3 shadow-lg backdrop-blur transition-all duration-300 ease-out ${
        visible ? "translate-x-0 opacity-100" : "translate-x-3 opacity-0"
      }`}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-label font-semibold text-text-primary">{item.sender}</div>
        <div className="mt-0.5 line-clamp-2 text-label leading-snug text-text-secondary">
          {item.preview}
        </div>
      </div>
    </div>
  );
}

/** Fixed top-right stack, below the status bar, above everything else. Newest
 * banner sits on top. */
export function Banners({ items }: { items: BannerItem[] }) {
  return (
    <div className="pointer-events-none fixed right-4 top-12 z-50 flex flex-col gap-2">
      {items.map((item) => (
        <Banner key={item.id} item={item} />
      ))}
    </div>
  );
}
