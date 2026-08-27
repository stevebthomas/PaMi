# PM Simulator: Roadmap

This roadmap describes what is shipped, what is planned, and the longer-term investments the codebase would
need before it can grow past a single day. It is grounded in the current code. Where something is
aspirational rather than built, that is stated plainly.

## Now (shipped)

Day 1 is complete and playable end to end. See [PRD.md](./PRD.md) for the full spec.

- A single scripted workday running 8:30 AM to a hard 6:00 PM boundary, built from 29 scenario events
  (`src/data/day1-scenario.ts`): a live Apple Pay checkout incident with a rollback-versus-patch-forward
  tradeoff that carries a hidden seller-payout cost discoverable only through diligence.
- A pixel-art desktop with Chattr, Pulse, Taskflow, Ask Claude, Reviews, Notes, and Office
  (`src/components/desktop/Taskbar.tsx`), plus an onboarding flow and an end-of-day scorecard.
- LLM-backed NPCs (Haiku personas) with a DM registry (`dmContacts.ts`) that makes Jordan and Chen reachable
  once they are on the fix and Marcus reachable all day.
- Two genuinely model-reasoned decisions (Raj's fallback tradeoff call via
  `/api/agents/raj-fallback-decision`, and the end-of-day coordination score), everything else deterministic
  timers and scripted beats.
- A groundedness-checked evaluator (Sonnet) that grades every player message against a claims ledger, with
  Pulse readings snapshotted onto messages at send time as a system source.
- A five-dimension scorecard (responseTime, triageQuality, commClarity, stakeholderMgmt, crossFunctional)
  with message-level coaching notes, roughly half deterministic and half LLM-judged.
- A generic `DayOutcome` record (`buildDayOutcome` in `dayOutcome.ts`) built at end of day and mirrored to
  localStorage (`outcomeStore.ts`). Nothing consumes it yet.

## Next (planned, not built): Days 2-5

Grounding note: these four themes come from the project plan, not from the code. `SCENARIO_LABELS` in
`src/data/day1-scenario.ts` still has exactly one entry ("Payment incident"), so nothing in the codebase
names or defines Days 2-5 yet.

For each future day: the PM skill to practice, the Day 1 infrastructure it would reuse, and one honest
reason it is not built yet.

- **Day 2: sprint planning.**
  - Skill: deciding what the team commits to and what gets cut when capacity is fixed and the asks exceed
    it.
  - Reuses: the DM registry (`DM_CONTACTS`), the `ScenarioEvent` firing model in `advanceClock`, and the
    `DayOutcome` record shape.
  - Why not yet: Day 1 depth was prioritized, and the engine still bakes in Day 1 assumptions (see the
    sequencing note below).
- **Day 3: data ambiguity.**
  - Skill: drawing a defensible read from incomplete or conflicting signals without overstating what the
    numbers actually support.
  - Reuses: the scenario timeline and timer pattern, and the per-message evaluator route.
  - Why not yet: there is no consumer of `DayOutcome` yet beyond the local scorecard view, so continuity
    between days has nowhere to live.
- **Day 4: stakeholder management.**
  - Skill: keeping competing stakeholders aligned and informed when their priorities pull in different
    directions.
  - Reuses: the DM registry and the Pulse pattern of building every metric as a pure function of the clock
    and a single source of truth.
  - Why not yet: `scorecard.ts`, `simStore.ts`, and `types.ts` still hardcode Day 1 event ids and mechanics,
    so a new day cannot drop in cleanly.
- **Day 5: roadmap tradeoffs.**
  - Skill: sequencing longer-horizon bets against each other when you cannot fund them all at once.
  - Reuses: the same event and scorecard infrastructure, and the `incidentTimeline` single-source-of-truth
    pattern.
  - Why not yet: the engine carries Day 1-specific state, and effort has gone into making Day 1 genuinely
    good rather than into breadth.

## Later (longer-term investment)

- **Multi-story engine and content separation.** Move Day 1-specific ids and concepts out of `simStore.ts`,
  `scorecard.ts`, and `types.ts` (for example `tradeoffChoice`, `marcusConsultedAtMinutes`,
  `INCIDENT_EVENT_ID`, `PAYMENTS_DOMAIN_ASSIGNEES`) into a scenario loader, so the engine can run any day's
  content. Not done yet because there is only one scenario, and separation is hard to get right without a
  second scenario to prove it against.
- **Persistence and auth.** A Supabase schema exists (`supabase/schema.sql`) with row-level security enabled
  on every table, but RLS policies key on `auth.uid()` and no auth flow exists, so inserts fail (the one
  wired write path, `logHelpQueryToSupabase`, fails on a missing `sim_sessions` row by design). Not done yet
  because there is no auth, and without it persistence cannot be turned on safely.
- **A playtest harness that drives the real store.** `scripts/playtest.ts` reimplements the store's event
  loop instead of importing `useSimStore`, so Raj's fallback decision, the Marcus consult mechanic, and live
  Pulse readings go untested (its ticket records lack ids and assignees, so `fixTicketAssigneeId` is always
  null there). Not done yet because the harness was built for speed of iteration, and importing the real
  store into a headless script is nontrivial.
- **Schema validation on LLM output.** Every JSON route regex-matches the first `{...}`, parses it, and
  clamps scores, degrading silently to neutral defaults with no logging. Not done yet because the
  clamp-and-default path has been good enough for a single-player demo.
- **Evaluator hardening.** Gaming resistance is narrow (three named exploits fixed; the last 25-attempt
  re-run reported 16 held, 5 gamed, 4 unclear). Not done yet because hardening beyond named exploits needs a
  larger, ideally human-verified test loop that does not exist.

## Sequencing rationale

Engine and content separation should happen before Day 2 content is built, not after. Today the store,
scorecard, and core types encode Day 1 ids and mechanics directly, so building Day 2 on the current engine
would either fork that logic or pile a second day's assumptions on top of the first, doubling the coupling
that already needs to be undone. Separating first means Day 2 becomes a content file plus a scenario loader
entry rather than a second set of edits to shared engine files, and it forces the abstractions to be
validated against real second-day content instead of guessed at. Building Day 2 first would make the
eventual separation strictly harder, because there would then be two days of tangled assumptions to unwind
instead of one.
