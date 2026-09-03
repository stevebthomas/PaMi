/**
 * In-sim document registry: the single source of truth for every document
 * the Docs app can open. A doc is pure data (id + title + markdown); the
 * viewer (see DocsApp.tsx) is fully generic and renders whichever entry an
 * attachment's `docId` points at.
 *
 * THIS IS THE EXTENSION POINT: adding a new in-sim doc is exactly one edit
 * here (add a SIM_DOCS entry) plus referencing its `id` from a message/event
 * `attachment: { label, docId }`, no component changes required. Docs open
 * inside the sim's Docs window and NEVER trigger a real browser download.
 */

import type { SessionDoc } from "@/lib/sim/types";

export interface SimDoc {
  id: string;
  title: string;
  /** Markdown source, rendered by DocWindow's scoped subset renderer (headings,
   * hr, bullet lists, bold/italic, blank-line paragraphs, and a `{{demo}}`
   * marker line). */
  markdown: string;
  /** Display filename for library tiles (e.g. "Welcome to BazaarLoop.md"). */
  filename: string;
  /** Opt-in interactive demo variant. When set, a `{{demo}}` marker line in the
   * markdown is replaced by the SaveDemo component in that variant (see
   * DocWindow/SaveDemo). Pure-data flag: the renderer, not this file, owns the
   * component. Omitted for ordinary text-only docs. */
  demo?: "saved-animation" | "silent-instant";
}

/** Derek's new-hire intro doc, previously a real file download
 * (public/docs/welcome-to-bazaarloop.md): now embedded verbatim so it opens
 * in-sim instead of leaving the player's machine with a file. */
const WELCOME_TO_BAZAARLOOP = `# Welcome to BazaarLoop

*A note from Derek, VP of Product*

---

## The company

BazaarLoop is a marketplace where people buy and sell secondhand goods. Think a mix of Etsy and eBay, built for a younger, mobile-first audience. We're a Series B/C company moving fast, with real customers and real revenue riding on the platform working well every day.

## Your role

You're the Product Manager for **Buyer Experience**. That means everything from search to checkout is your surface area: how people find what they're looking for, how they decide to buy, and how that purchase actually goes through.

This isn't a role where you sit and plan quietly. You'll be working directly with:

- **Raj:** Engineering Manager, runs the squad building your features
- **Priya:** Operations & Support Lead, hears from customers first
- **Maya:** Design Lead, owns the look and feel of what you ship
- **Marcus:** handles data and technical diligence across the team
- **Derek:** that's me, your manager, VP of Product

## What the work actually looks like

Some days are calm. Some days aren't. You'll get pulled into live incidents, asked to weigh in on design tradeoffs, and expected to communicate clearly with people who have different priorities than you, sometimes all before lunch.

There's no script for a day like this. Nothing on your calendar is guaranteed to go as planned. Your job is to handle whatever comes up, make calls with incomplete information, and own the tradeoffs that come with those calls.

## Getting oriented

- **Chattr** is where the team talks. Channels for general updates and live incidents, plus direct messages.
- **Pulse** shows you the live data: checkout success, traffic, whatever's actually happening on the platform right now.
- **Taskflow** is where engineering work gets tracked.
- **Office** shows you who's working on what, across the team.
- If a term or acronym trips you up, **Ask Claude** is there to explain it. No judgment, just answers.

Good luck. Start your day whenever you're ready.
`;

/** Maya's mockup A: the "saved!" animation option for Theo's wishlist
 * save-for-later tap. */
const MAYA_MOCKUP_SAVED_ANIMATION = `# Mockup A: "saved!" animation

A small "saved!" animation plays when you tap save-for-later on Theo's
wishlist ticket.

- **Gives you:** a visible confirmation moment, the tap clearly registered
- **Costs you:** a beat of delay and motion before the interaction feels done

## Try it

Tap save-for-later and watch for the confirmation. Tap it again to reset, then replay.

{{demo}}
`;

/** Maya's mockup B: the silent, instant option for the same tap. */
const MAYA_MOCKUP_SILENT_INSTANT = `# Mockup B: silent + instant

No animation. The item just saves the moment you tap save-for-later.

- **Gives you:** an instant feel, nothing standing between the tap and done
- **Costs you:** no explicit confirmation moment for the user to notice

## Try it

Tap save-for-later. The state flips the instant you tap, with nothing in between. Tap again to reset.

{{demo}}
`;

export const SIM_DOCS: Record<string, SimDoc> = {
  "derek-welcome-doc": {
    id: "derek-welcome-doc",
    title: "Welcome to BazaarLoop",
    markdown: WELCOME_TO_BAZAARLOOP,
    filename: "Welcome to BazaarLoop.md",
  },
  "maya-mockup-saved-animation": {
    id: "maya-mockup-saved-animation",
    title: "Mockup A: 'saved!' animation",
    markdown: MAYA_MOCKUP_SAVED_ANIMATION,
    filename: "Saved Animation Mockup.md",
    demo: "saved-animation",
  },
  "maya-mockup-silent-instant": {
    id: "maya-mockup-silent-instant",
    title: "Mockup B: silent + instant",
    markdown: MAYA_MOCKUP_SILENT_INSTANT,
    filename: "Silent Instant Mockup.md",
    demo: "silent-instant",
  },
};

/** Defensive lookup: an id may be undefined or unknown (e.g. a legacy
 * persisted attachment that carried the old `{label, href}` shape and has no
 * `docId`, or a typo'd id). Returns undefined in those cases so callers can
 * degrade gracefully rather than crash. */
export function getSimDoc(id: string | undefined | null): SimDoc | undefined {
  if (!id) return undefined;
  return SIM_DOCS[id];
}

/**
 * Resolve a docId against session-generated docs FIRST, then the static
 * SIM_DOCS registry. This is the single resolution point every Docs surface
 * (the Chattr attachment chip, the Docs library tile, the doc window) should
 * use so a runtime-generated doc (stateBag.sessionDocs, e.g. the 9:00 standup
 * notes) opens and renders through the exact same plumbing as an authored one.
 * A SessionDoc is structurally a SimDoc (it simply omits the optional `demo`
 * field), so it flows through DocWindow unchanged. Session docs take precedence
 * so a generated doc can shadow a registry id if one ever collides; in practice
 * the id spaces are disjoint. Tolerates an absent map (old sessions, tests) and
 * an unknown id, returning undefined so callers degrade gracefully. */
export function resolveSimDoc(
  id: string | undefined | null,
  sessionDocs?: Record<string, SessionDoc>
): SimDoc | undefined {
  if (!id) return undefined;
  const generated = sessionDocs?.[id];
  if (generated) return generated;
  return SIM_DOCS[id];
}
