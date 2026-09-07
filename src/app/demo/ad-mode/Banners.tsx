"use client";
/*
 * DEMO/FILMING SCAFFOLDING — NOT REAL AD/GAME CONTENT — safe to delete after ad shoot is done.
 *
 * macOS-style notification stack. The real app has no notification system, so
 * the banner shell itself is demo-only — but the sender's portrait is the real
 * PixelAvatar, the same sprite the message thread underneath is drawing, so a
 * banner and the line it previews always show the same face.
 *
 * Every banner shown here is pushed by the script in script.ts: hardcoded for
 * filming, no real logic. EVERY NPC MESSAGE IN THE AD PUSHES ONE (the
 * director's policy; player lines never do), so this stack is the ad's running
 * commentary and a banner that fails to show is a hole in the shot — which is
 * why the arrival no longer depends on a timer at all (see Banner below). The
 * engine owns the timing (2600ms auto-dismiss, 300ms fade/slide out) and clears
 * the whole stack on reset.
 *
 * THE STACK PUSHES. macOS does not re-flow a notification stack instantly, and
 * neither does this one: each banner is absolutely positioned at a MEASURED
 * offset (the summed heights of the banners above it, plus one gap each), and
 * that offset transitions. So a newly-arrived banner appears at the top in
 * place, and the ones already on screen slide DOWN to make room instead of
 * teleporting. Newest on top.
 *
 * How the push falls out of the measurement, with no special-casing: an
 * unmeasured banner contributes 0 to the offsets below it, so on the frame a
 * banner is added, the ones under it still render at their OLD offsets. The
 * layout effect then measures the newcomer and re-renders — still before paint,
 * so no overlapping frame is ever shown — and the older banners' transform
 * transitions from the offset they were last painted at to the new one. That is
 * the push. A brand-new banner has no previously-painted transform, so it just
 * lands at its offset; which is also why a FAST-FORWARD that dumps several
 * banners at once places them all instantly rather than fanning them out.
 *
 * Banners never gate anything: the engine does not know this file exists.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { PixelAvatarView } from "@/components/shared/PixelAvatar";
import type { AgentId } from "@/lib/sim/types";
import { DEMO_PLAYER_SPRITE_ID } from "./ScriptedApps";

export type BannerItem = {
  id: number;
  agentId: AgentId;
  sender: string;
  preview: string;
  /** Flipped by the engine ~300ms before removal so the exit can animate. */
  leaving: boolean;
};

/** Stack geometry. The gap is the `gap-2` this stack used to get from flexbox,
 * kept as a number now that the offsets are computed rather than laid out. */
const BANNER_WIDTH_PX = 340;
const BANNER_GAP_PX = 8;
/** How long a banner takes to slide down to a new slot. Long enough to read as
 * a push, short enough that the next arrival never catches it. */
const BANNER_PUSH_MS = 350;

/**
 * THE ENTER IS A CSS ANIMATION, AND THE RESTING STATE IS VISIBLE.
 *
 * This used to be a React state flip on a 20ms timer ("paint the off state
 * once, then flip a tick later so the transition runs"), which made INVISIBLE
 * the default and one tiny timer the only thing standing between a banner and
 * never being seen. That is a bad bet for a filming route: browsers clamp
 * sub-second timers hard in a backgrounded or occluded tab (measured: the 20ms
 * tick lands at ~1000ms there, i.e. nearly half a banner's life spent at
 * opacity 0, with the fade itself frozen). A take recorded in a window that is
 * not frontmost would show a stack of blank slots.
 *
 * Now the card's resting state is the VISIBLE one and the arrival is a keyframe
 * animation off it. No state, no timer, nothing to miss.
 *
 * DELIBERATELY NO `fill-mode`. With `both`, an animation that has not started
 * yet paints its `from` frame — which is the invisible one, i.e. exactly the
 * failure this rewrite exists to remove, just moved from a timer to the
 * compositor. With the default `none`, anything outside the animation's own
 * running window falls back to the element's class value, which is
 * `opacity-100`: a banner whose animation never runs is simply THERE. The style
 * is also dropped the moment the banner starts leaving, so a finished
 * animation's specificity can never outrank the exit fade.
 */
const BANNER_ENTER_MS = 300;
const BANNER_ENTER_KEYFRAMES = `@keyframes ad-banner-in {
  from { opacity: 0; transform: translateX(12px); }
  to { opacity: 1; transform: translateX(0); }
}`;

function Banner({ item }: { item: BannerItem }) {
  return (
    // The enter/exit fade+slide lives HERE, on the inner card, and the stack
    // offset lives on the wrapper outside it: two transforms on two elements,
    // so the arrival animation and the push can never fight over one property.
    <div
      className={`flex w-full items-start gap-3 rounded-xl border border-border-hairline bg-surface/95 p-3 shadow-lg backdrop-blur transition-all duration-300 ease-out ${
        item.leaving ? "translate-x-3 opacity-0" : "translate-x-0 opacity-100"
      }`}
      style={
        item.leaving ? undefined : { animation: `ad-banner-in ${BANNER_ENTER_MS}ms ease-out` }
      }
    >
      <PixelAvatarView agentId={item.agentId} sizeClassName="h-8 w-8" playerSpriteId={DEMO_PLAYER_SPRITE_ID} />
      <div className="min-w-0 flex-1">
        <div className="text-label font-semibold text-text-primary">{item.sender}</div>
        <div className="mt-0.5 line-clamp-2 text-label leading-snug text-text-secondary">
          {item.preview}
        </div>
      </div>
    </div>
  );
}

/**
 * Vertical offsets, top to bottom: each banner sits below everything above it,
 * plus one gap per banner above. An unmeasured banner contributes 0, which is
 * what leaves the cards under a just-arrived one at their old offsets for the
 * one render that produces the push (see the module comment).
 */
function placeBanners(
  items: BannerItem[],
  heights: Record<number, number>,
): { item: BannerItem; top: number }[] {
  const placed: { item: BannerItem; top: number }[] = [];
  let offset = 0;
  for (const item of items) {
    placed.push({ item, top: offset });
    offset += (heights[item.id] ?? 0) + BANNER_GAP_PX;
  }
  return placed;
}

/** Fixed top-right stack, below the status bar, above everything else. Newest
 * banner sits on top and the ones under it slide down to make room. */
export function Banners({ items }: { items: BannerItem[] }) {
  /** Measured card heights by banner id. A banner not in here yet contributes
   * nothing to the offsets below it — see the module comment: that is exactly
   * what produces the push. */
  const [heights, setHeights] = useState<Record<number, number>>({});
  const nodes = useRef(new Map<number, HTMLDivElement | null>());

  // BEFORE PAINT, so the corrected offsets are never shown as an overlap. Pure
  // measurement: it writes only when a height actually changed (or a banner
  // left), and returns the same object otherwise, so it settles in one pass.
  useLayoutEffect(() => {
    setHeights((prev) => {
      const next: Record<number, number> = {};
      let changed = false;
      for (const item of items) {
        const measured = nodes.current.get(item.id)?.offsetHeight;
        // A leaving banner is mid-fade; keep its last known height so the cards
        // under it hold still until it is actually removed.
        const height = measured ?? prev[item.id] ?? 0;
        next[item.id] = height;
        if (prev[item.id] !== height) changed = true;
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) return prev;
      return next;
    });
  }, [items]);

  const placed = placeBanners(items, heights);

  return (
    <div
      className="pointer-events-none fixed right-4 top-12 z-50"
      style={{ width: BANNER_WIDTH_PX }}
    >
      {/* Demo-local keyframes: the arrival animation above, kept in this file
          so the shoot adds nothing to the app's global stylesheet. */}
      <style>{BANNER_ENTER_KEYFRAMES}</style>
      {placed.map(({ item, top }) => (
        <div
          key={item.id}
          ref={(el) => {
            if (el) nodes.current.set(item.id, el);
            else nodes.current.delete(item.id);
          }}
          className="absolute right-0 top-0 w-full ease-out"
          style={{
            transform: `translateY(${top}px)`,
            transitionProperty: "transform",
            transitionDuration: `${BANNER_PUSH_MS}ms`,
          }}
        >
          <Banner item={item} />
        </div>
      ))}
    </div>
  );
}
