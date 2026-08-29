/**
 * In-sim document registry — the single source of truth for every document
 * the Docs app can open. A doc is pure data (id + title + markdown); the
 * viewer (see DocsApp.tsx) is fully generic and renders whichever entry an
 * attachment's `docId` points at.
 *
 * THIS IS THE EXTENSION POINT: adding a new in-sim doc is exactly one edit
 * here (add a SIM_DOCS entry) plus referencing its `id` from a message/event
 * `attachment: { label, docId }` — no component changes required. Docs open
 * inside the sim's Docs window and NEVER trigger a real browser download.
 */

export interface SimDoc {
  id: string;
  title: string;
  /** Markdown source, rendered by DocsApp's scoped subset renderer (headings,
   * hr, bullet lists, bold/italic, blank-line paragraphs). */
  markdown: string;
}

/** Derek's new-hire intro doc, previously a real file download
 * (public/docs/welcome-to-bazaarloop.md) — now embedded verbatim so it opens
 * in-sim instead of leaving the player's machine with a file. */
const WELCOME_TO_BAZAARLOOP = `# Welcome to BazaarLoop

*A note from Derek, VP of Product*

---

## The company

BazaarLoop is a marketplace where people buy and sell secondhand goods — think a mix of Etsy and eBay, built for a younger, mobile-first audience. We're a Series B/C company moving fast, with real customers and real revenue riding on the platform working well every day.

## Your role

You're the Product Manager for **Buyer Experience**. That means everything from search to checkout is your surface area — how people find what they're looking for, how they decide to buy, and how that purchase actually goes through.

This isn't a role where you sit and plan quietly. You'll be working directly with:

- **Raj** — Engineering Manager, runs the squad building your features
- **Priya** — Operations & Support Lead, hears from customers first
- **Maya** — Design Lead, owns the look and feel of what you ship
- **Marcus** — handles data and technical diligence across the team
- **Derek** — that's me, your manager, VP of Product

## What the work actually looks like

Some days are calm. Some days aren't. You'll get pulled into live incidents, asked to weigh in on design tradeoffs, and expected to communicate clearly with people who have different priorities than you — sometimes all before lunch.

There's no script for a day like this. Nothing on your calendar is guaranteed to go as planned. Your job is to handle whatever comes up, make calls with incomplete information, and own the tradeoffs that come with those calls.

## Getting oriented

- **Chattr** is where the team talks — channels for general updates and live incidents, plus direct messages.
- **Pulse** shows you the live data — checkout success, traffic, whatever's actually happening on the platform right now.
- **Taskflow** is where engineering work gets tracked.
- **Office** shows you who's working on what, across the team.
- If a term or acronym trips you up, **Ask Claude** is there to explain it — no judgment, just answers.

Good luck. Start your day whenever you're ready.
`;

export const SIM_DOCS: Record<string, SimDoc> = {
  "derek-welcome-doc": {
    id: "derek-welcome-doc",
    title: "Welcome to BazaarLoop",
    markdown: WELCOME_TO_BAZAARLOOP,
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
