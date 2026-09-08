# PaMi: Product Requirements (Day 1)

## 1. Overview

PaMi is a single-player, browser-based training simulation that puts a brand-new project manager through one
simulated workday at BazaarLoop, a fictional secondhand marketplace (an Etsy/eBay mix built for a younger,
mobile-first audience). The player works inside a pixel-art desktop of apps (team chat, a live metrics dashboard, a
ticket board, an engineering floor view, and a glossary assistant) and lives through Day 1: a live payments incident
in which Apple Pay checkouts are failing through a flaky Stripe webhook. Support escalates, the engineering manager
offers a rollback-versus-patch-forward tradeoff that carries a hidden downstream cost, and a VP relays whatever the
player says straight to the CEO. At end of day the player writes a postmortem and receives a scorecard across five
dimensions with message-level coaching notes. The pitch is a flight simulator for PM judgment under pressure: a
place to practice the calls that are otherwise only learnable on the job.

## 2. Problem statement

Project managers are judged on judgment under pressure: how fast they assess a blast radius, whether they take
ownership of a decision or let it drift, whether they ground what they say in real signals instead of inventing
numbers, how well they relay information up to stakeholders, and whether they see the hidden cost inside a tradeoff.
These skills are hardest to practice safely, because the only realistic setting for them is a real incident with
real consequences. Existing options each fall short:

- **Case studies** are retrospective and static. You read what someone else decided, but never feel the time
  pressure, never choose without full information, and never get feedback on a call you made yourself.
- **Mock interviews** test how you talk about product decisions, not how you make them live. They reward a polished
  narrative, not deciding as new facts arrive mid-answer with a stakeholder waiting.
- **On-the-job learning** is the real thing, but expensive to get wrong: a new PM learns incident judgment by
  mishandling an actual incident, in front of actual colleagues, with actual customers affected.

None of these lets someone practice the specific loop of read the situation, ground your claims, make the call, own
it, and communicate it, repeatedly and without real-world cost.

## 3. Target user

- **Primary:** aspiring and early-career PMs (for example MS or MBA students, career switchers, people preparing for
  a first PM role) who want reps on incident-style judgment before facing it for real.
- **Secondary:** hiring teams and PM coaches who want a controlled, repeatable scenario to observe how a candidate
  handles ambiguity, ownership, and grounded communication.

Assumed versus validated: everything about who this helps is currently an assumption. There has been no user
research, no pilot, and no coach or hiring team has used it to assess anyone. The product is complete and playable
for Day 1, but nothing about its value to either audience has been validated with real users yet.

## 4. Goals and success metrics

**Product goals**

- A player completes Day 1 end to end (8:30 AM start through the postmortem) and receives a scorecard with specific,
  message-level coaching, not a generic grade.
- Coaching is grounded: praise and criticism point at the actual claim, message, or decision the player made, and
  the evaluator does not credit facts the player never actually had.
- The day rewards judgment, not gaming: citing a real dashboard reading is grounded, inventing a figure is not, by
  construction.

**Metrics collectable given what exists today.** "Instrumented" means the data is captured where the code already
writes it: the `DayOutcome` record (`src/lib/sim/dayOutcome.ts`), built at end of day and mirrored to localStorage
(`outcomeStore.ts`). There is no server-side aggregation, so every metric below needs a consumer built, and
cross-user rollups need a persistence and auth layer that does not exist.

- **Completion rate.** Partially instrumented: `DayOutcome.endedBy` distinguishes `postmortem` from
  `forced-end-of-day`; localStorage only, no aggregation.
- **Postmortem submission rate.** Instrumented per record (`deliverables.postmortemSubmitted`); localStorage only,
  no aggregation.
- **Share of players who consult Marcus before the fix decision.** Instrumented per record
  (`diligence.marcusConsultedAtMinutes` and the derived `marcusConsultedBeforeDecision`); localStorage only, no
  aggregation.
- **Evaluator groundedness under an adversarial re-run.** Measured once, not continuously. The most recent audit
  (`playtests/adversarial-gaming-report.md`) reports 25 attempts audited, 16 held, 5 gamed, 4 unclear, itself an LLM
  auditor's reading of an LLM adversarial persona's playthrough, run by hand.
- **Cost per playthrough.** Not measured. Only a client-side estimator exists (`costStore.ts`, `costEstimate.ts`)
  with hardcoded per-million prices for two models and a default for the rest; the README's estimate is qualitative
  ("a few dozen model calls total"). No per-run cost is logged.

## 5. V1 scope, as it actually exists

**The desktop.** The taskbar (`src/components/desktop/Taskbar.tsx`) launches Chattr (team chat and DMs), Pulse (live
metrics dashboard), Taskflow (ticket board), Ask Claude (glossary and concepts assistant), Reviews (past
scorecards), Notes, and Office (engineering floor view). An onboarding flow (`WelcomeScreen`, `OnboardingScreen`,
`HROrientationChat`) runs at the start; an end-of-day scorecard (`DayScorecard`, `ScorecardDetail`) appears when the
day wraps. Ask Claude is deliberately not a coach: its prompt (`ASK_CLAUDE_PROMPT`) explains terms only and refuses
anything the player could paste into a message.

**The Day 1 story arc (real times from `src/data/day1-scenario.ts`, 29 scripted events).** Sim time runs 8:30 AM
(minute 510) to a hard 6:00 PM boundary (1080):

- 8:30 AM: day starts, welcome notification. 8:35 AM: Raj's standup heads-up. 9:00 AM: scripted standup.
- 8:45 AM: Priya DMs a low-key heads-up about overnight checkout-failure tickets (requires a response; follow-up at
  9:05 if ignored).
- 9:15 AM: Priya escalates in #incidents (14 tickets in the last hour, all Apple Pay). This is the beat response
  time is measured against.
- 9:20 AM: Raj diagnoses the Stripe webhook returning 500s on about 3% of Apple Pay attempts. 9:26 AM: Priya DMs
  asking for a CS template for her team.
- 9:32 AM: Raj surfaces the un-owned staffing question (pull Jordan or Chen, or leave them, "your call").
- 9:38 AM: Raj offers the rollback-versus-patch-forward tradeoff. Neither is clean: rollback is the sure roughly
  10-minute fix but reverts last week's faster seller payouts; patch-forward keeps payout speed but takes roughly 30
  minutes and Raj cannot promise it fully covers the failure on first ship.
- 9:42 AM: Priya flags the rollback's seller-payout stake and offers to pull the exact affected-seller count if
  asked.
- 9:45 AM: Raj nudges in DM if the escalation is still unanswered (mood turns frustrated). 10:00 AM: Priya's
  fallback if still unanswered.
- Around 10:05 AM: if the tradeoff is undecided, the store kicks off Raj's own fallback decision (a live model
  call).
- 10:20 AM: if the player never decided, Derek relays that Raj made the call himself and why (holds until Raj's
  decision resolves, then delivers at that time); a 10:22 AM #incidents follow-up mirrors it.
- 11:00 AM: resolution. Clean variant if the player answered the escalation and gave a good CS template; cold
  variant otherwise (CS wrote its own message; Priya and Raj moods drop).
- 12:30 PM: Maya asks a low-stakes, incident-unrelated design question in #design-review.
- 1:30 PM: Derek asks for a blast-radius recap before an afternoon CEO sync (also satisfiable in #incidents;
  follow-up at 1:50).
- 2:30 PM: on a rollback path, the payout consequence lands. If Marcus was not consulted in time, he reports a
  duplicate-payout hit on multi-bank-account sellers (Priya follow-up at 2:32); if consulted in time, a clean
  variant fires in his DM instead. Nothing fires on patch-forward.
- 3:30 PM: postmortem prompt (Derek nudge at 3:50 if unsubmitted). 6:00 PM: hard end of day. Ambient ungraded
  easter-egg beats (Theo at 11:15 AM and 2:15 PM) fill the quiet stretches.

**NPC roster and who is messageable.** LLM-backed NPC personas run on Haiku (the technical audit counts eight).
Always DM-able: Raj (EM), Priya (Ops and Support Lead), Derek (VP Product). Conditionally DM-able via the registry
(`dmContacts.ts`): Jordan and Chen once pulled onto the fix, Marcus all day (which makes the payout cost
discoverable). Maya (backend engineer) is reachable in #design-review; Sam (Head of People) appears in the HR
orientation chat. Ines and Theo are Office-floor flavor; Theo also posts ambient lines in #random but has no DM
persona.

**Evaluator and scorecard.** The scorecard (`scorecard.ts`) reports five dimensions (`responseTime`,
`triageQuality`, `commClarity`, `stakeholderMgmt`, `crossFunctional`) plus an unweighted `overall`, roughly half
deterministic and half LLM-judged:

- **Deterministic (code):** `responseTime` is a step function of how fast the 9:15 escalation was acknowledged (10
  within 5 sim-minutes, 8 within 15, 6 before the 9:45 nudge, 3 after, 1 if never). Aggregation, penalties, and
  which coaching notes appear are code: a no-postmortem penalty, a penalty when Raj had to escalate the tradeoff to
  Derek, assignment-quality deltas (domain match against `PAYMENTS_DOMAIN_ASSIGNEES`, unassigned critical ticket,
  concentration on one engineer), and a Marcus diligence delta (plus or minus one).
- **LLM-judged (Sonnet, low effort):** four per-message dimensions (tone, speed, completeness, strategicThinking) on
  every graded-channel player message, plus one end-of-day `crossFunctional` coordination score. The evaluator gets
  the full transcript, must emit a claims ledger (each claim `GROUNDED`, `UNSOURCED`, or `CHALLENGED` with a quoted
  source) before scoring, and Pulse readings are snapshotted onto each player message at send time so a cited
  dashboard figure is grounded by data path, not prompt instruction alone.

**Reasoned NPC decisions.** Timers and scripted beats drive the arc, but NPC replies are live model calls, and two
decisions are genuinely model-reasoned: Raj's fallback tradeoff call (`/api/agents/raj-fallback-decision`, Sonnet)
and the coordination score. Marcus, Priya, and the resolution variants react to state (fix path, whether Marcus was
consulted in time), not randomness.

**The DayOutcome record.** At end of day the app builds a generic, day-agnostic `DayOutcome` (`buildDayOutcome`)
capturing the fix path and who decided it, diligence signals, response timings, deliverables, DM contacts used, and
final scores. It is mirrored to localStorage. Nothing consumes it yet.

## 6. Explicit non-goals for v1

- Multiple days. Only Day 1 exists; `SCENARIO_LABELS`, `DAY_START_MINUTES`, and `DAY_END_MINUTES` are keyed by day
  but each holds one entry.
- Multiplayer or shared-session play.
- Accounts, auth, or server-side persistence. State lives in browser Zustand stores; a refresh loses the session
  (localStorage mirrors only the finished `DayOutcome`).
- Mobile or responsive layouts.
- Content-authoring tools or custom or user-authored scenarios.
- Guaranteed gaming resistance. Named exploits were fixed; general resistance is not claimed.
- Production hardening: no auth or rate limiting on API routes, no schema validation on LLM output.

## 7. Key user stories

1. As a new PM, I want the incident to unfold on a clock, so that I practice deciding without full information.
   Acceptance: `advanceClock` fires the 29 events by `triggerTimeMinutes`; the day auto-ends at minute 1080.
2. As a player, I want my response time to matter, so that acknowledging fast is rewarded. Acceptance:
   `scoreResponseTime` keys off `respondedAtMinutes["priya-incidents-escalation"]` against the 9:15 trigger and 9:45
   nudge.
3. As a player, I want to make the rollback-versus-patch-forward call myself, so that I own a real tradeoff.
   Acceptance: replying sets `tradeoffChoice` and `tradeoffDecidedAtMinutes`; a coaching note names the path and
   whether I owned it.
4. As a player, I want to be penalized if I let the tradeoff drift, so that ownership is enforced. Acceptance: if
   undecided by 10:20, `derek-tradeoff-escalation` sets `tradeoffEscalatedToDerek`, applying a
   stakeholder-management penalty.
5. As a diligent player, I want to DM Marcus about payouts before the fix decision, so that I get credit for
   foreseeing the downstream cost. Acceptance: a payout-relevant DM sets `marcusConsultedAtMinutes`; if at or before
   `tradeoffDecidedAtMinutes`, the diligence credit applies and the clean payout beat fires.
6. As a player who skipped that diligence on a rollback, I want the hidden cost to land, so that the lesson is
   concrete. Acceptance: `marcus-payout-inconsistency` fires at 2:30 PM only when `tradeoffChoice === "rollback"`
   and Marcus was not consulted in time, setting `payoutInconsistencySurfaced`.
7. As a player, I want to send Priya an accurate CS holding message, so that support has something to tell
   customers. Acceptance: a good draft (judged by `evaluate-cs-template`) sets `csTemplateProvided`, selecting
   `resolution-good` over `resolution-cold`.
8. As a player, I want to give Derek a grounded recap, so that what reaches the CEO is accurate. Acceptance:
   `derek-escalation` is answerable in DM or #incidents; Derek-DM tone and completeness feed `stakeholderMgmt`.
9. As a player, I want credit for assigning the fix ticket to the right engineer, so that triage judgment is
   measured. Acceptance: the assignee is checked against `PAYMENTS_DOMAIN_ASSIGNEES` (Jordan, Chen) for the
   assignment deltas and notes.
10. As a player citing Pulse, I want that figure treated as grounded, so that reading real signals beats inventing
    them. Acceptance: `Message.dashboard` snapshots the reading at send time and the evaluator treats it as a
    source.
11. As a player, I want to look up jargon without being coached, so that I learn terms without shortcutting the
    decision. Acceptance: `ASK_CLAUDE_PROMPT` answers concepts only and refuses paste-ready text; questions feed the
    end-of-day "areas to study."
12. As a player, I want an end-of-day scorecard with message-level coaching, so that I learn from specific moves.
    Acceptance: `computeScorecard` returns five scores plus `CoachingEntry` notes tied to messages; a
    zero-engagement day collapses to one honest "presence, not technique" note.

## 8. Open questions and risks

- **Evaluator drift and nondeterminism.** The four per-message scores and the coordination score come from Sonnet at
  `effort: "low"`, chosen for cost. There is no measurement of the groundedness accuracy that trades away, and no
  run-to-run determinism guarantee.
- **Gaming resistance is narrow, not general.** Three named exploits (claim laundering by repetition, the evaluator
  inventing a source, a live NPC challenge not carrying forward) were fixed and verified on synthetic replays. The
  last 25-attempt re-run held on those three but still let 5 attempts through (mostly an unconfirmed root cause
  stated as fact in a CS draft or Derek recap). "Hardened" means those three bugs are fixed, not that gaming is
  prevented; the audit is an LLM judging an LLM.
- **Cost per playthrough is not measured.** Only a client-side estimator with hardcoded prices exists; no real
  per-run cost is logged.
- **The playtest harness does not drive the real store.** `scripts/playtest.ts` reimplements the store's event loop
  rather than importing `useSimStore`, so it can drift from app behavior. Untested by the personas: Raj's live
  fallback decision, the Marcus consult mechanic, and live Pulse readings (its ticket records lack ids and
  assignees, so `fixTicketAssigneeId` is always null there).
- **Scale assumption is unresolved (decision pending).** `worldCanon.ts` reverse-derives checkout volume from
  Priya's 14 tickets/hour and Raj's 3% Apple Pay failure, landing at roughly 25,300 attempts/day (floor roughly
  12,700/day at a 100% filing rate). The stated design target was "low thousands per day," which is arithmetically
  unreachable without changing one of those fixed narrative facts. Whether to lower Priya's number, drop the
  reconciliation, or accept roughly 25k/day is pending, not resolved here.
- **Engine and content are coupled.** `scorecard.ts`, `simStore.ts`, and `types.ts` still hardcode Day 1 event ids
  and concepts (`StateBag` fields like `tradeoffChoice` and `marcusConsultedAtMinutes` are Day 1 specific), which
  will make future days expensive until the engine is separated from content.
- **No user validation yet.** No real player, student, candidate, or coach has used this; every claim about value is
  an assumption.
- **AI-voice tells in LLM output.** Em-dashes are a known tell. A shared writing-style instruction is in every
  prompt and one route strips em-dashes server-side, but personas still emit them (around 28% before the stripping
  route existed). Not solved, and a risk to the "feels real" framing.
- **No schema validation on LLM output.** Every JSON route regex-matches the first `{...}`, parses it, and clamps
  scores; a malformed response degrades silently to neutral 5s with no logging.
- **Supabase persistence needs auth before it is usable.** A schema exists (`supabase/schema.sql`) with row-level
  security enabled on every table, but the one wired write path (`logHelpQueryToSupabase`) fails because no
  `sim_sessions` row is ever created, and RLS policies key on `auth.uid()` with no auth flow. Persistence is
  effectively blocked until auth exists.
