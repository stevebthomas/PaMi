# PM Simulator

A realistic training simulation for new Product Managers. You play a brand-new PM at BazaarLoop, a
fictional secondhand-marketplace startup, working one simulated day inside a pixel-art desktop
(Chattr for team chat, Pulse for the live metrics dashboard, Taskflow for tickets, Office for the
engineering floor, Ask Claude for on-demand glossary and concept help, deliberately not coaching). Day 1 drops you into a live payments incident:
Apple Pay checkouts are failing through a Stripe webhook, support is escalating, your EM offers a
rollback-vs-patch-forward tradeoff with a hidden downstream cost, and a VP is relaying whatever you
tell him straight to the CEO. At the end of the day you get a scorecard with coaching notes. The idea
is simple: PM judgment under pressure is hard to practice safely, so this is a flight simulator for it.

## Status

- **Day 1 is complete and playable end to end.** Days 2-5 do not exist. The types and a generic,
  day-agnostic `DayOutcome` record are in place for future days (`buildDayOutcome` in
  `src/lib/sim/dayOutcome.ts`), but nothing in the app consumes a saved outcome yet, there's no Day 2
  content, and `SCENARIO_LABELS` / `DAY_START_MINUTES` / `DAY_END_MINUTES` are `Record<number, ...>`
  with exactly one entry.
- **Single-player, browser-local state.** Everything lives in Zustand stores in the tab; a refresh
  loses the session. `DayOutcome` records are additionally mirrored to `localStorage`
  (`src/lib/sim/outcomeStore.ts`) so a finished day survives a reload, but nothing reads it back yet.
  A Supabase schema exists (`supabase/schema.sql`), but only one write path is wired up
  (`logHelpQueryToSupabase`), and its own doc comment says the insert fails on a foreign key because
  no `sim_sessions` row is ever created. There's no auth flow, so a real persistence layer isn't
  built.
- **No unit tests.** There's no jest/vitest/CI. Verification is an AI playtest suite
  (`npm run playtest`) that drives the real app through scripted personas, plus a couple of headless
  store scripts run by hand.

## What's technically interesting

**Groundedness-checked evaluator.** Every graded player message is sent to Sonnet with the full
conversation transcript, and the model has to emit a claims ledger (`GROUNDED` / `UNSOURCED` /
`CHALLENGED`, with a quoted source) before it produces any scores. An NPC challenge to a claim carries
forward: re-asserting a challenged claim later without new evidence has to be named and scored low.
Pulse dashboard readings are snapshotted onto each message at send time, so a player citing the
dashboard is grounded and a player inventing a number is not, by construction, not by prompt
instruction alone. This was hardened after an adversarial AI playtest gamed it 6 of 15 ways
(`playtests/baseline-2026-08-26-early/adversarial-gaming-report.md`): claim laundering by repetition,
the evaluator inventing a source for a number nobody gave, and a live challenge from an NPC not
carrying forward into later scoring. A follow-up 25-attempt re-run against the fixed evaluator
(`playtests/adversarial-gaming-report.md`) held on exactly those three failure modes, they didn't
reappear, but 5 new attempts still got through, mostly the same shape of exploit (an unconfirmed root
cause stated as fact) landing in a customer-support draft or a design-review aside instead of the main
incident channel. So "hardened" means those three named bugs are fixed, not that gaming resistance is
general.

**Single sources of truth.** `incidentTimeline.ts` is the only place that computes when the fix
lands; Pulse, the engineer DM personas, the follow-up pings, and the `DayOutcome` record all read from
it instead of keeping their own copy (a real bug this caught: two engineer personas gave contradictory
timelines before this file existed). `worldCanon.ts` holds company scale, the engineering roster, and
the player's role scope, and derives checkout volume from the two fixed narrative facts (Priya's 14
tickets/hour, Raj's 3% Apple Pay failure rate) so no one can reintroduce an unreconciled number.
`pulseMetrics.ts` builds every dashboard reading as a pure function of the clock and the timeline, with
checked invariants like completed + failed == attempts.

**Reasoned NPC decisions with consequences.** If the player never resolves the rollback-vs-patch-forward
tradeoff, Raj (the EM) decides via a model call that weighs the two documented costs, not a hardcoded
branch, measured at roughly a 10:6 split across runs. Derek (the VP) relays Raj's reasoning, and
whichever path gets taken propagates into Pulse, the Office view, engineer dialogue, and the coaching
notes. Separately, Marcus is hardening the seller payout pipeline that a rollback would revert
mid-batch; that cost is foreseeable if the player DMs him before the tradeoff is decided, and invisible
if they don't.

**AI playtest suite.** `npm run playtest` runs four Opus personas (new-to-product, seasoned PM, chaos,
adversarial) through the real scenario logic and the app's real API routes, not mocks, with an
adversarial gaming audit and a findings log that persists across runs. `npm run scenario-audit` is a
separate, static, LLM-driven design review of the scenario content.

**Built with a multi-agent orchestrator workflow.** `CLAUDE.md` defines an engineering-lead role for
the top-level session: decompose a request into bounded subtask specs with explicit acceptance
criteria, delegate each to a subagent, then review the returned diff before accepting it. Routine work
goes to `executor` (Sonnet); ambiguous, high-risk, or previously-failed subtasks go to `senior-executor`
(Opus). Both are defined in `.claude/agents/`.

## Tech stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand, `@anthropic-ai/sdk`, Supabase
(`@supabase/supabase-js` / `@supabase/ssr`, schema only), `tsx` for scripts.

## Run locally

```bash
git clone <repo-url>
cd pm-simulator
npm install
cp .env.local.example .env.local
# set ANTHROPIC_API_KEY in .env.local; Supabase vars are optional and unused by the app today
npm run dev
```

Open http://localhost:3000.

Per-agent model overrides live in `.env.local.example` (`RAJ_MODEL`, `PRIYA_MODEL`, `DEREK_MODEL`,
`SAM_MODEL`, `EVALUATOR_MODEL`, `ASK_CLAUDE_MODEL`) if you want to swap models for cost or comparison.
Approximate cost: NPC personas run on Haiku, the evaluator and coaching calls run on Sonnet, and a full
day of play is a few dozen model calls total.

## Project structure

```
src/app/            Routes: /sim (the desktop UI), /api/agents/* and /api/help (LLM routes)
src/components/     Desktop apps: chattr, pulse, taskflow, office, askclaude, scorecard, onboarding, reviews
src/store/          Zustand: simStore (main sim state/clock), taskflowStore, windowStore, costStore
src/lib/sim/        Engine: types, incidentTimeline, pulseMetrics, worldCanon, dmContacts, scorecard, dayOutcome
src/lib/agents/     Prompts (prompts.ts) and the shared Anthropic client (anthropic.ts)
src/data/           day1-scenario (the scripted Day 1 events), study-resources
scripts/            playtest, scenario-audit, test-day-outcome (headless store driver)
playtests/          Playtest run output and findings logs
supabase/           schema.sql (not currently wired to a working persistence path)
docs/               technical-audit.md (the honest internal audit this README is based on)
.claude/agents/     executor.md, senior-executor.md (the orchestrator subagent definitions)
```

## Known gaps

- No schema validation on any LLM output: every JSON route does a regex match for `{...}`, then
  `JSON.parse`, then clamps scores to a range. A malformed model response silently degrades to neutral
  defaults with no logging.
- No auth or rate limiting on any API route. Anyone with the URL can spend the configured API key.
- Engine/content separation is partial. `src/lib/sim/scorecard.ts`, `src/store/simStore.ts`, and
  `src/lib/sim/types.ts` all still reference Day 1 event ids and concepts directly (`StateBag` fields
  like `tradeoffChoice` and `marcusConsultedAtMinutes` are Day-1-specific, not generic).
- The playtest harness reimplements the store's event loop in the script rather than importing the
  real `useSimStore`, so it can drift from actual app behavior. Concretely, Raj's fallback decision,
  the Marcus consult mechanic, and live Pulse dashboard readings aren't exercised by the playtest
  suite today.
