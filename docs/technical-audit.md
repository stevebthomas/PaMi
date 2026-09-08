# PaMi: Technical Audit

Scope: the `pm-simulator` codebase as of 2026-08-26, working tree (uncommitted). All claims reference files under `src/`, `scripts/`, `playtests/`, `supabase/`. Line numbers are approximate; function and type names are exact.

Summary in one paragraph: this is a single-player, client-state Next.js app that simulates one scripted workday (Day 1, 29 scenario events) with 8 LLM-backed NPC personas (Haiku), a per-message evaluator (Sonnet), and five auxiliary Sonnet/Haiku classifier calls. State lives entirely in Zustand stores in the browser tab; Supabase is wired but effectively unused. There are no unit tests and no CI; testing is four scripted AI-persona playthroughs plus ad-hoc headless store scripts. The strongest engineering in the repo is the single-source-of-truth modules (`incidentTimeline.ts`, `worldCanon.ts`, `pulseMetrics.ts`) and the evaluator's claims-ledger prompt design. The weakest points are: no schema enforcement on any LLM output, no persistence, no auth on API routes, one git commit, and adversarial-gaming fixes verified only on synthetic transcripts rather than a re-run of the adversarial playtest.

---

## 1. Architecture

### 1.1 All LLM calls

Every call goes through `getAnthropicClient()` in `src/lib/agents/anthropic.ts` and one of the Next.js route handlers below. There is no streaming, no tool use, no structured-output API; every route sends a system prompt plus user content, takes the text back, and (where JSON is expected) regex-extracts the first `{...}` block and `JSON.parse`s it.

| Route (`src/app/api/...`) | Model (env-overridable) | System prompt (in `src/lib/agents/prompts.ts` unless noted) | Input | Output |
|---|---|---|---|---|
| `agents/reply` | `claude-haiku-4-5` for all personas (`PERSONA_MODELS`, `anthropic.ts:25-35`) | `AGENT_SYSTEM_PROMPTS[agentId]` + `moodContextLine` + `reactionContextLine` + `easterEggReactionLine` + `groundingContextLine` + `personaContext` (engineer/Marcus LIVE STATUS from `src/lib/sim/dmContacts.ts:buildDmPersonaContext`) | Chat history mapped to user/assistant turns; other NPCs' lines prefixed `[senderId]:` | Plain text |
| `agents/evaluate` | `claude-sonnet-4-6` (`EVALUATOR_MODEL`), `effort: "low"`, `max_tokens: 1500` | `EVALUATOR_PROMPT` | Full chronological transcript across all channels, with `[pulse] DASHBOARD:` lines and optional `observations` block; last line marked `<-- GRADE THIS ONE` | JSON `{claims:[{claim,status,source}], tone, speed, completeness, strategicThinking, feedback}`; only the four scores + feedback are returned to the client |
| `agents/evaluate-coordination` | Sonnet, low effort | `COORDINATION_PROMPT` | Full transcript at end of day | JSON `{score, note}` |
| `agents/evaluate-tradeoff` | Sonnet, low effort | `TRADEOFF_EVAL_PROMPT` | Raj's offer + player reply | JSON `{choice: rollback\|patch-forward\|unclear, hasReasoning, note}` |
| `agents/evaluate-cs-template` | Sonnet, low effort | `CS_TEMPLATE_EVAL_PROMPT` | Player's draft + established facts | JSON `{...grounded flags, note}` |
| `agents/study-areas` | Sonnet, low effort | `STUDY_AREAS_PROMPT` | Ask Claude questions + coaching notes + known topic keys | JSON `{matchedTopicKeys, additionalTopics}` |
| `agents/suggest-followup-ticket` | Sonnet, low effort | `FOLLOWUP_TICKET_PROMPT` | Postmortem text | JSON `{title, description}` or none |
| `agents/gate` | Haiku (`GATE_MODEL`) | `CROSS_FUNCTIONAL_GATE_PROMPT` | Minimal context (not full transcript) | JSON `{shouldReact, ...}` |
| `agents/raj-fallback-decision` | Sonnet (`RAJ_FALLBACK_MODEL`) | `RAJ_FALLBACK_DECISION_PROMPT` | Empty body; all facts are in the prompt (interpolated from `worldCanon`/`payoutCanon`) | JSON `{choice, reasoning, derekLine}`; em-dashes stripped server-side |
| `help` | Haiku (`ASK_CLAUDE_MODEL`) | `ASK_CLAUDE_PROMPT + ASK_CLAUDE_TAG_INSTRUCTION` | Ask Claude chat history | Plain text with a trailing topic tag parsed out |

Off-app calls (not routes): `scripts/playtest.ts` uses `claude-opus-5` (`PERSONA_MODEL`) for the four playtest personas, `GUIDANCE_SYNTHESIS_PROMPT`, and `ADVERSARIAL_AUDIT_PROMPT`; `scripts/scenario-audit.ts` runs a static design-review pass with a model.

Why Sonnet for Raj's fallback: the agent that built it measured Haiku collapsing 8:0 to one side on symmetric prompts; Sonnet split 10:6 over 16 calls. This is recorded in the route's doc comment, not in a test.

### 1.2 Schema enforcement on LLM output

**None.** No Zod, no JSON Schema, no Anthropic structured-output feature. `zod` appears only as a transitive dependency in `node_modules`. Every JSON route does:

```ts
// src/app/api/agents/evaluate/route.ts:110-124
const jsonMatch = raw.match(/\{[\s\S]*\}/);
if (!jsonMatch) return NextResponse.json({ tone: 5, speed: 5, completeness: 5, strategicThinking: 5, feedback: "", usage });
const parsed = JSON.parse(jsonMatch[0]);
const result: EvaluationResult = {
  tone: clampScore(parsed.tone), ...
  feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
};
```

`clampScore` coerces to a 0-10 integer and defaults to 5 on NaN. TypeScript interfaces (`EvaluationResult`, `DayOutcome`, etc.) describe the intended shape but are not runtime-checked. A malformed model response degrades to neutral 5s silently; there is no logging of that path. The `claims` ledger the evaluator is required to emit is never validated or persisted; it exists only to force the model's ordering of reasoning.

### 1.3 State management

Everything is client-side, in-memory Zustand (`src/store/simStore.ts` 1313 lines, `taskflowStore.ts`, `windowStore.ts`, `costStore.ts`). No `persist` middleware, no localStorage; a page refresh loses the session.

- Sim clock: `clockMinutes` in `simStore`; `advanceClock(n)` fires due `ScenarioEvent`s (with `condition(state)` and `applyEffect(state)`), runs deterministic hooks (Taskflow ticket transitions, Raj fallback kickoff, fix-landed follow-up DMs), and applies the 11:00 auto-resolve default.
- Conversation history: `messages: Message[]` with `channel`, `senderId`, `sentAtSimMinutes`, optional `dashboard` (Pulse reading snapshotted at send time).
- Story state: `StateBag` (`src/lib/sim/types.ts`): `respondedAtMinutes`, moods, `tradeoffChoice`, `tradeoffDecidedAtMinutes`, `tradeoffEscalatedToDerek`, `rajFallbackDecision`, `marcusConsultedAtMinutes`, `payoutInconsistencySurfaced`, `fixLandedFollowUpsSent`, etc.
- Derived single sources of truth: `src/lib/sim/incidentTimeline.ts` (`getIncidentTimeline`: decidedAt, expectedLandAt, landedAt, fullyRecoveredAt, phase), `pulseMetrics.ts` (all dashboard numbers as pure functions of clock + timeline), `worldCanon.ts` / `payoutCanon.ts` (company facts).
- Supabase: `supabase/schema.sql` defines `profiles`, `sim_sessions`, `scenario_events`, `messages`, `evaluations`, `help_queries`. Only `help_queries` is ever written (`src/lib/supabase/persist.ts:logHelpQueryToSupabase`), and its own doc comment says the insert fails on the `session_id` foreign key because no `sim_sessions` row is ever created. Scenario events are hardcoded in `src/data/day1-scenario.ts`, not loaded from the `scenario_events` table. There is no auth flow.

---

## 2. Evaluator and scoring

### 2.1 What the evaluator receives

There is no single "end of session" evaluation. Scoring is a combination of:

1. **Per-message grading during play.** Every player message in `GRADED_CHANNELS = {incidents, dm_derek, design-review}` (`simStore.ts:43`) triggers `/api/agents/evaluate` with the **raw full transcript** so far across every channel and DM (including DMs to Raj/Priya/engineers, which are themselves ungraded), each player line preceded by a `[pulse] DASHBOARD:` line if the incident is active, plus a deterministic `observations` block from `src/lib/sim/sessionObservations.ts` (message count, median length, question ratio, first-reply clock time). The postmortem is graded through this same route as an ordinary message.
2. **End-of-day coordination score.** `/api/agents/evaluate-coordination` receives the raw full transcript once, returns one 0-10 `crossFunctional` score.
3. **Side-channel classifiers** at specific beats: tradeoff reply (`evaluate-tradeoff`), CS template draft (`evaluate-cs-template`). These produce coaching notes and set state flags; they do not feed the four per-message score dimensions.
4. **Deterministic scorecard math** at end of day (`src/lib/sim/scorecard.ts:computeScorecard`), which consumes the stored per-message evaluations plus `StateBag` and Taskflow tickets.

No summaries or structured fact lists are sent to the model; the "established facts" are whatever appears in the transcript text, plus the dashboard lines.

### 2.2 Concrete signals

**LLM-side (from `EVALUATOR_PROMPT`, `prompts.ts:~409-530`):**
- Groundedness rules, verbatim in intent: a claim is grounded only if an NPC/system line supplied it or it is a transparent derivation ("~3%" → "1 in 30"); player repetition is not verification; an NPC echoing the player is not verification; never presume a source ("must have come from Derek" is forbidden); an NPC challenge carries forward and re-asserting a challenged claim without new NPC evidence must be named in feedback and drive completeness/strategicThinking low; hedged estimates are treated more leniently than flat assertions; `[pulse] DASHBOARD` lines are a system source.
- Required output ordering: a `claims` array (`GROUNDED|UNSOURCED|CHALLENGED` with quoted source) must be emitted **before** the scores.
- Four 0-10 dimensions: tone, speed (judged from content, not wall time), completeness (progress on blast radius/ownership/next steps/the question asked), strategicThinking.
- `#design-review` special case: completeness/strategicThinking fixed at 8; the option chosen must never affect scores.
- Path-flexibility instructions: don't penalize order of contacts, information-gathering before committing, or splitting an update across messages.
- Observations block: may shape feedback wording only; explicit "firewall" that it must not move the `speed` score (added after measurement showed a latency observation shifted `speed` by 1-2 points).

**Deterministic (`scorecard.ts`):**
- `responseTime`: `scoreResponseTime(ackAt)`: 10 if acked within 5 sim-minutes of the 9:15 escalation, 8 within 15, 6 before the 9:45 nudge, 3 after, 1 if never. Ack = any player message in a satisfying channel (`src/lib/sim/acknowledgment.ts:satisfyingChannels`), regardless of content.
- `triageQuality` = mean of `completeness` over #incidents evaluations (default 2 if none) + assignment delta (−1.5 if the fix ticket was never assigned) + Marcus diligence delta (±1).
- `commClarity` = mean `tone` over graded evaluations − 3 if no postmortem.
- `stakeholderMgmt` = mean of Derek-DM `tone` and `completeness` (fallback 4 if Derek was answered, else 1) − 3 if no postmortem − 2 if Raj had to escalate the tradeoff to Derek.
- `crossFunctional` = placeholder 5, replaced by the coordination call's score when it resolves.
- `overall` = unweighted mean of the five.
- Zero-engagement override: if no player messages and no evaluations, all coaching notes are replaced by a single "presence, not technique" note and the study-areas call is skipped.
- Additional deterministic coaching notes: assignment quality (domain match against `PAYMENTS_DOMAIN_ASSIGNEES`), concentration (all tickets to one person), tradeoff escalated, tradeoff path taken and by whom, Marcus diligence credit/miss, no postmortem.

So: roughly half deterministic, half LLM. The LLM decides four per-message numbers and one coordination number; code decides timing, penalties, aggregation, and which notes appear.

### 2.3 Anti-gaming: what is actually enforced

Enforced in prompt design and route wiring, not in code that verifies claims:
- The evaluator sees the whole transcript, never a summary the player could shape.
- Dashboard readings are injected by the store at send time (`Message.dashboard`, `simStore.sendPlayerMessage`), so a player citing Pulse is grounded and a player inventing a number is not; this is a code-level data path, not a prompt instruction.
- The claims-ledger-first output shape and the four laundering rules were added in direct response to the adversarial playtest findings (see 3.2).
- Derek's live persona independently receives the #incidents transcript (`groundingContextLine`) so he can challenge unsourced claims in-character before they propagate.

Not enforced:
- Nothing verifies the ledger's `source` quotes actually exist in the transcript. The model could cite a line that isn't there; the code would not notice.
- The fix was validated with `curl` on four synthetic transcripts, two runs each, plus one browser session. The adversarial persona playtest that found the six gaming successes (`playtests/adversarial-gaming-report.md`, generated 2026-08-26T05:10Z) has **not been re-run** against the fixed evaluator. The honest statement is "the specific exploits were reproduced synthetically and no longer pass," not "the evaluator is resistant to gaming."
- `effort: "low"` on the evaluator was chosen for cost; no measurement exists of how much groundedness accuracy that trades away.
- The adversarial audit report itself is LLM-judged (`ADVERSARIAL_AUDIT_PROMPT`, Opus): an LLM reading the transcript decided which attempts "held" or "gamed." Those labels were not human-verified item by item.

---

## 3. Testing

### 3.1 What exists

- **No unit tests, no test runner, no CI.** `package.json` has no jest/vitest/playwright; the only `*.test.*` files are in `node_modules`.
- `npm run playtest` (`scripts/playtest.ts`, 1163 lines): repeatable, scripted. Drives the real scenario logic and real API routes against a running dev server with four Opus personas (`new-to-product`, `seasoned-pm`, `chaos`, `adversarial`), N runs each (`--runs`, `--personas`), writes `playtests/*-run-N.json` and aggregates. It reimplements the store's event loop in the script rather than importing `useSimStore` (its `TicketRecord` lacks ids/assignees, so `fixTicketAssigneeId` is always null there). Includes an LLM synthesis of "guidance opportunities" (currently empty: `guidance-opportunities.json` has `findings: []`) and the adversarial audit.
- `npm run scenario-audit` (`scripts/scenario-audit.ts`): static, LLM-driven design review of the scenario data; writes `scenario-audit-day1.md` and a findings log. One-shot analysis, not a regression test.
- `scripts/test-day-outcome.ts`: headless script that imports the **real** `useSimStore`/`useTaskflowStore`, shims `fetch` to `localhost:3000`, and drives a full day; prints the `DayOutcome` JSON. Repeatable but has no assertions; it is a manual inspection aid.
- Ad-hoc `tsx` scripts written during development in a temp directory (not in the repo) verified: Pulse invariants (completed + failed == attempts), timeline phases, ticket pacing, Raj fallback distribution, Marcus consequence branches. These were run once each and are not preserved.
- Manual browser verification through a Chrome automation extension for most UI changes; not scripted.

All runs to date were triggered manually by the developer. Nothing runs on commit.

### 3.2 Bugs actually caught, with enough detail to explain

1. **Claim laundering by repetition** (adversarial playtest, item 6). The persona stated "~400 failed checkouts" unsourced in #incidents; the evaluator flagged it. It then relayed the same 400 to Derek; the evaluator wrote "'400 failed checkout attempts' is a figure you cited earlier in the incident thread, so it's grounded." Root cause: the prompt asked "was this established before?" and treated prior mention as establishment. Fix: explicit rules that player repetition and NPC echo are not sources, plus the claims-ledger-first output. Verified by synthetic replay (C1), not by re-running the persona.
2. **Evaluator inventing a source** (item 10). The postmortem cited "412 attempts" and "140 retried"; no NPC ever gave those. The evaluator wrote "must have come from Derek's sync follow-up, which is fine." Fix: "never presume a source; if you cannot point to the line, it is ungrounded."
3. **Challenge not carried forward** (item 11). Derek, live, asked whether anyone actually checked the ledger. The postmortem later said "we confirmed against the ledger." The evaluator called it "really strong, grounded." Fix: CHALLENGED status in the ledger; re-assertion without new evidence must be named and scored low. Replay now yields completeness 3-4/10 with the challenge named.
4. **Contradictory timelines from two personas** (manual play). Jordan at 10:47 said the rollback was "landing in the next couple minutes"; Chen at 4:05 PM said it happened "about 20 min ago." Root cause: `dmContacts.ts` had its own `FIX_DURATION_MINUTES`, Pulse had its own recovery constants, and the "resolved" flag carried no timestamp, so each persona reconstructed history. Fix: `incidentTimeline.ts` as the only source of `landedAt`; personas quote it verbatim.
5. **Hardcoded fallback** (repeated manual runs). Derek's 10:20 escalation always said "rollback." Replaced with a Sonnet call that weighs the two documented costs; measured 10:6 split.
6. **ES-module init cycle** (headless run, not tsc). `day1-scenario → worldCanon → incidentTimeline → day1-scenario` crashed at load. Passed `tsc` and `eslint`. Fixed by moving scenario-needed facts to a leaf module `payoutCanon.ts`.
7. **Observation leakage into scores** (measured during build). Passing "first reply came 25 min after" to the evaluator shifted the `speed` score 1-2 points on identical content, violating "tone only." Reframed as an absolute clock time and added a prompt firewall; re-measured as flat.
8. **Ticket skipped In Progress** (manual play): investigation ticket went To Do → Done in one +15m step. Fixed by keying transitions on separate scripted beats.

Not caught by anything automated: the checkout volume balloon (7.4k at 8:30 AM, 63k/day) was noticed by eye.

---

## 4. Engine / content separation

Partially real, not clean.

**Content lives in:** `src/data/day1-scenario.ts` (29 `ScenarioEvent`s with `condition`/`applyEffect`/`contentFor`), `src/data/study-resources.ts`, `src/lib/sim/worldCanon.ts` + `payoutCanon.ts`, and the persona prompts inside `src/lib/agents/prompts.ts`.

**Generic engine pieces that are genuinely data-driven:** `acknowledgment.ts` (satisfying channels from event fields), `dmContacts.ts` registry with `availableWhen` predicates, `ScenarioEvent` firing/conditions in `advanceClock`, `incidentTimeline.ts` reads trigger times from scenario data rather than hardcoding.

**Day 1 leakage into "engine" files** (grep for `day1ScenarioEvents`, `priya-incidents-escalation`, `dm_raj`, etc.):
- `src/lib/sim/scorecard.ts`: `INCIDENT_EVENT_ID = "priya-incidents-escalation"`, `DEREK_EVENT_ID = "derek-escalation"`, `PAYMENTS_DOMAIN_ASSIGNEES`, Marcus/rollback logic, and the full text of a dozen coaching notes.
- `src/store/simStore.ts`: imports `day1ScenarioEvents` directly; ticket hooks keyed on `"raj-diagnosis"`/`"raj-tradeoff-offer"`; tradeoff detection gated on `"raj-tradeoff-offer"`; `MARCUS_PAYOUT_KEYWORDS`; `SCRIPTED_RAJ_FALLBACK`.
- `src/lib/sim/types.ts`: `AgentId`, `ChannelId`, `StateBag` fields (`tradeoffChoice`, `marcusConsultedAtMinutes`, `payoutInconsistencySurfaced`) are Day 1 concepts in the core types.
- `src/lib/sim/relevance.ts`: keyword routing tables per channel per agent.
- `src/lib/sim/pulseMetrics.ts`, `incidentTimeline.ts`: Apple Pay / Stripe incident specifics.
- `src/components/pulse/PulseMock.tsx`, `chattr/FactChecklist.tsx`, `onboarding/WelcomeScreen.tsx`: reference Day 1 events by id.

There is no `src/engine/` vs `src/content/` boundary and no second scenario to prove the engine generalizes. A fair description: "events, personas, and canon are data files; the store, scorecard, and types still encode Day 1 assumptions."

---

## 5. Honest gaps

**Mocked / hardcoded / simplified**
- Pulse is a closed-form model (`severityAt(t)`), not data; every number is a pure function of the clock and two state fields. The 7-day chart is six hand-set weights times a scale factor.
- The "company" scale chain in `worldCanon.ts` is back-derived from two scripted lines (14 tickets/hour, 3% Apple Pay failure). It cannot reach the intended "low thousands/day" without changing one of those lines; current canon is ~25k/day with a documented floor of ~12.7k.
- Supabase: schema exists, one insert exists and fails on a foreign key by design comment. No auth, no sessions, no persistence, no multi-user. Refresh loses everything.
- API routes have no authentication or rate limiting; anyone with the URL can spend the API key.
- Cost tracking (`costStore`, `costEstimate.ts`) uses hardcoded per-million prices for two models and a default for everything else.
- The adversarial "gaming report" is an LLM's reading of an LLM's playthrough.
- Raj's fallback "reasoning" comes from a model call with a fixed prompt; variability is sampling, not simulated state. Any "different engineers reason differently" claim is a framing of temperature.
- Em-dashes: a shared writing-style instruction is in every prompt, and one route strips them server-side; measured residual rate in NPC replies was ~28% before the stripping route existed, and personas still emit them. Not solved.
- Easter eggs, HR onboarding chat, Office placeholder rooms ("Work in progress") are present and visibly unfinished.
- `scripts/playtest.ts` mirrors the store's event loop instead of importing it, so playtest behavior can drift from the app.

**Claims that would not survive a pointed follow-up**
- "The evaluator can't be gamed" → It was gamed 6/15 ways last night; fixes were verified on synthetic replays only; no re-run.
- "Structured LLM outputs" → Regex + `JSON.parse` + clamp, no schema validation, silent neutral fallback.
- "Tested" → No unit tests; playtests are manual invocations; most verification scripts were throwaway and are not in the repo.
- "Persistent sessions / Supabase backend" → Not wired; comment in `persist.ts` says the one insert fails.
- "Engine/content separation" → Types, store, and scorecard still hardcode Day 1 event ids and mechanics.
- "Multi-day simulation" → Exactly one day exists; `DayOutcome` is produced but nothing consumes it; `SCENARIO_LABELS`/`DAY_START_MINUTES` are `Record<number, ...>` with one entry.
- "Deterministic scoring" → Only partly; four of five dimensions depend on Sonnet outputs graded at `effort: "low"`.
- "Version-controlled" → One commit ("Initial commit from Create Next App"); the entire application is uncommitted working-tree changes.
- "Realistic scale" → 25k checkouts/day for a 200-person Series B/C company is defensible but above the owner's stated target, and the chain rests on an assumed 50% ticket-filing rate.

**Things that do hold up**
- One source of truth for incident timing and dashboard math, with invariants that were checked (`completed + failed == attempts`; personas quote `landedAt` verbatim).
- Dashboard readings snapshotted onto messages at send time as an evaluator-visible data source.
- Reasoned (not hardcoded) NPC fallback with visible reasoning, and consequences that differ by path and by whether the player consulted Marcus, all keyed on state, not randomness.
- Cost-conscious model routing (Haiku personas, Sonnet judgment, one Sonnet call for the fallback decision, free deterministic pre-filter before the gate call).
