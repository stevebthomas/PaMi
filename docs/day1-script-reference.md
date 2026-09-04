# Day 1 Walkthrough Reference — Filming Guide

A start-to-finish map of everything the Day 1 "Payment incident" scenario can do, written for whoever is
sitting at the keyboard planning a demo take. It tells you what fires when, what each character will and
won't do, which forks produce the most watchable downstream cascade, and where the sim is thin or fragile
so you can steer around it on camera.

The whole day runs on a sim clock, not wall-clock time. It opens at **8:30 AM** and ends hard at **6:00 PM**
(the player advances time with a "+15m" control, so you control the pace). Everywhere below, when a beat is
"scripted at 9:38," that means sim-clock 9:38, and it fires the moment the clock crosses that minute. A few
beats key off *state* instead of the clock (an obligation the world is waiting on, an NPC follow-up); those
are called out as such.

One framing fact worth internalizing before you film: **the sim grades how you handle the incident, never
which fix you pick.** Rollback and patch-forward are both defensible. That is deliberate, and it is also the
source of the single best "this thing is actually smart" moment — the claims-ledger catch in Section 4.

---

## 1. Timeline of scripted beats

Times are sim-clock. "Fixed" = fires unconditionally once the clock passes it. "Conditional" = only fires if
a state test passes at that minute (the test is spelled out in plain English). All 40 scripted event ids in
`src/data/day1-scenario.ts` are represented here; a completeness cross-check follows the table.

### Morning: login through standup (8:30 – 9:15 AM)

| Sim time | Who / channel | Event id | Fixed or conditional |
|---|---|---|---|
| 8:30 AM | System notification, #general | `sys-welcome` | Fixed. Day-framing welcome. |
| 8:30 AM | Derek, DM | `derek-welcome-dm` | Fixed. Warm first-day note + attached "Welcome to BazaarLoop.md" doc. Deliberately fires at login so Derek's DM is never empty. |
| 8:35 AM | Raj, #general | `raj-standup-heads-up` | Fixed. "Morning everyone, standup in 25." |
| 8:45 AM | Priya, DM | `priya-heads-up-dm` | Fixed. The overnight-tickets heads-up. **Requires a response** (30-min deadline). This is the first thing that tracks whether you engaged. |
| 8:45 AM | System notification, #general | `standup-reminder-15` | Fixed. "Standup in 15 minutes." |
| 8:55 AM | System notification, #general | `standup-reminder-5` | Fixed. "Standup in 5 minutes." |
| 9:00 AM | (UI, not an event) | — | The **Join Standup** affordance appears (`STANDUP_START_MINUTES`). Clicking it opens the call overlay; this is the standup join/skip fork (see below). |
| 9:05 AM | Priya, DM | `priya-early-followup` | **Conditional:** only if you have NOT yet responded to the 8:45 heads-up. "Volume's still climbing… did you get a chance to look?" |
| 9:15 AM | System, #general | `standup` (digest) | **Conditional:** only if you did NOT join the standup (`!standupAttended`). Posts the standup digest to #general and saves "Standup Notes, Day 1" into Docs. If you joined, the store posts the summary on Leave instead, so exactly one digest exists either way. |

### The incident (9:15 – 10:22 AM)

| Sim time | Who / channel | Event id | Fixed or conditional |
|---|---|---|---|
| 9:15 AM | Priya, #incidents | `priya-incidents-escalation` | Fixed. "OK this is escalating. 14 tickets in the last hour… All Apple Pay." **Requires a response** (30-min deadline). The incident is now formally declared. |
| 9:20 AM | Raj, #incidents | `raj-diagnosis` | Fixed. "Stripe webhook for Apple Pay is returning 500s on ~3% of attempts." Supplies the root-cause facts. |
| 9:26 AM | Priya, DM | `priya-template-request` | Fixed. Asks for a customer-facing note ("doesn't need to be polished, just accurate"). Silently records that you owe her the CS template and seeds her two follow-ups (see obligations below). |
| 9:31 AM | Jordan, #design-review | `jordan-designreview-spacing` | Fixed. Jordan posts a real, ongoing blocker (mobile spacing note on the payment selector rebuild) and nudges Maya. This NPC message itself isn't graded — only your own reply in #design-review would be, under the special case in Section 4. |
| 9:32 AM | Raj, #incidents | `raj-ownership-check` | **Conditional:** only if you have NOT responded to the 9:15 escalation. "I can pull Jordan or Chen off the redesign… that's your call." |
| 9:38 AM | Raj, #incidents | `raj-tradeoff-offer` | Fixed. **The rollback-vs-patch-forward offer.** Content is state-aware (see Section 2). This is the central decision beat. |
| 9:42 AM | Priya, #incidents | `priya-seller-payout-flag` | Fixed. Flags the seller-payout cost of a rollback; offers to pull the exact count if it'd help you decide. Content is state-aware. |
| 9:45 AM | Raj, DM | `raj-nudge` | **Conditional:** only if the 9:15 escalation is still unanswered. "Kind of need a call on this." Sets Raj's mood to *frustrated*. |
| 10:00 AM | Priya, DM | `priya-no-response-fallback` | **Conditional:** only if the 9:15 escalation is still unanswered. "CS is asking me what to tell customers…" Sets Priya's mood to *overwhelmed*. |
| 10:08 AM | Sam, #random | `sam-random-coffee-run` | Fixed ambient. Coffee run offer. |
| 10:13 AM | Theo, #random | `theo-random-coffee-reply` | Fixed ambient. Theo replies to Sam — the one NPC-to-NPC thread of the day. |
| 10:20 AM | Derek, DM | `derek-tradeoff-escalation` | **Conditional:** only if you never decided the tradeoff AND Raj's own fallback decision has resolved. Derek relays Raj's *actual* choice and reasoning. Marks `tradeoffEscalatedToDerek`. |
| 10:22 AM | Raj, #incidents | `raj-tradeoff-escalation-followup` | **Conditional:** fires alongside the Derek escalation (tradeoff undecided by you, or escalated to Derek). Raj logs the call he made himself in-channel. |

### Midday and afternoon (11:00 AM – 6:00 PM)

| Sim time | Who / channel | Event id | Fixed or conditional |
|---|---|---|---|
| 11:00 AM | System, #general | `resolution-good` / `resolution-partial` / `resolution-cold` | **Conditional (three mutually exclusive variants).** Exactly one fires, keyed on the CS-note state (see Section 3). Cold variant also sets Priya=*overwhelmed*, Raj=*frustrated*. |
| 11:15 AM | Theo, #random | `theo-random-bathroom` | Fixed ambient. "Does anyone know where the bathroom is." Easter egg if you help. |
| 11:40 AM | Maya, #random | `maya-random-design-debt` | Fixed ambient. |
| 11:55 AM | Marcus, #random | `marcus-random-cake` | Fixed ambient. Leftover cake. |
| 12:30 PM | Maya, #design-review | `maya-design-question` | Fixed. Save-for-later animation-vs-silent design call. **Requires a response** (120-min deadline). Attaches two mockup docs. Seeds Maya's EOD follow-up. |
| 1:29 PM | System notification, DM | `derek-notification` | Fixed. "Derek has messaged you." |
| 1:30 PM | Derek, DM | `derek-escalation` | Fixed. Asks for blast radius + what happened, before the CEO sync. **Requires a response** (20-min deadline). Also satisfiable by posting in #incidents. Content is state-aware (briefed-vs-cold). |
| 1:50 PM | Derek, DM | `derek-followup` | **Conditional:** only if the 1:30 ask is still unanswered. "Still need that recap." |
| 2:15 PM | Theo, #random | `theo-random-lunch` | Fixed ambient. Lunch order. Easter egg if you join. |
| 2:30 PM | Marcus, #incidents | `marcus-payout-inconsistency` | **Conditional:** only on the rollback path where you did NOT consult Marcus in time. The duplicate-payout consequence beat. Sets `payoutInconsistencySurfaced`. |
| 2:30 PM | Marcus, DM | `marcus-payout-clean` | **Conditional:** only on the rollback path where you DID consult Marcus in time. The reward beat (mutually exclusive with the one above). |
| 2:32 PM | Priya, #incidents | `priya-payout-inconsistency-followup` | **Conditional:** same condition as the inconsistency beat. Sellers filing tickets about the dupe. |
| 2:35 PM | Derek, DM | `derek-unassigned-fix-nudge` | **Conditional:** only if the payment-fix ticket exists AND has no assignee. "Who's actually credited as owning the payment fix in Taskflow?" |
| 3:30 PM | System, #incidents | `postmortem-prompt` | Fixed. The postmortem prompt. **Requires a response.** Submitting it ends the day (see hard boundaries). |
| 3:50 PM | Derek, DM | `derek-postmortem-nudge` | **Conditional:** only if the postmortem is not yet submitted. |
| 4:15 PM | Priya, #random | `priya-random-five-star` | Fixed ambient. Deliberately unrelated to CSAT so it can't contradict a bad-day mood. |
| 5:00 PM | Chen, #random | `chen-random-eod-fried` | Fixed ambient. Chen calling it a day. |

### State-triggered engine firings (not clock beats)

These come from the obligation engine (`obligations.ts`), which never fires on a clock alone — every firing
also passes a live state test, and a "cancelWhen" can settle it silently instead. In plain English:

- **Priya's CS-template nudge** (`priya-cs-nudge`): fires ~45 sim-min after her 9:26 ask (so ~10:11 AM)
  **only if you still haven't attempted any customer-facing draft.** Attempting anything — even a weak draft
  — cancels it silently. One-time, low-pressure.
- **Priya's resolved-context follow-up** (`priya-cs-resolved-followup`): if the incident resolves (11:00)
  and you *still* never attempted a draft, she follows up once noting her team covered it. Cancelled the
  moment you attempt a draft. Can fire even if the nudge above already fired — it's a genuinely new state.
- **Priya's seller-comms ask** (`priya-seller-comms-ask`): **rollback path only.** Fires ~10 sim-min after
  the rollback is decided. Asks for a seller-facing note about the payout delay. No cancel condition — once
  the rollback is chosen, the sellers really are affected, so the note is genuinely owed. Patch-forward never
  seeds it.
- **Raj's all-clear** (`raj-all-clear`): seeded when any fix path is decided. Raj posts a personal all-clear
  in #incidents once metrics fully recover — **unless the 11:00 formal resolution beats him to it**, in which
  case it settles silently as redundant. So you only see Raj's own all-clear if recovery happened strictly
  before 11:00 (fast rollback, decided early).
- **Maya's EOD design follow-up** (`maya-design-followup`): fires at **5:00 PM** in #design-review **only if
  you never answered her 12:30 question.** Any reply between 12:30 and 5:00 cancels it. This is the classic
  "postmortem-ends-the-day-early" trap — see Section 5, edge #2.

### Standup join/skip fork

- The **Join** button appears at 9:00 AM and expires at 9:15 AM.
- **Join path:** the call overlay plays sequential speaker lines (Raj, Priya, Maya-as-"Design"); on Leave
  the store posts the digest to #general and sets `standupAttended`, and saves the Standup Notes doc.
- **Skip path:** the `standup` event fires the identical digest to #general at 9:15 and saves the identical
  doc. Attendance changes the *experience*, never whether the notes are kept. Exactly one #general digest
  exists in either path.
- Only Priya's standup line varies (see the ⭐ "Like I flagged to Steve earlier" line in Section 2).

### DM contact unlocks (`dmContacts.ts`)

- **Jordan** (fix lead) and **Chen** (fix support): become DM-able and clickable in Office **the moment a fix
  path exists** (`tradeoffChoice` non-null) — whether you decided it, Raj decided it, or it auto-resolved.
- **Marcus**: DM-able **all day, from login** (his availability predicate is always true). This is the whole
  point — a diligent player can DM him before the fix call and discover the rollback's payout cost. Ines and
  Theo are intentionally never DM-able (no persona).

### Hard boundaries

- **9:15 AM** — the standup Join affordance expires (`STANDUP_EXPIRE_MINUTES`). After this you can't join;
  the digest posts instead.
- **Postmortem submission ends the day immediately.** Whatever hasn't fired yet never fires (see Section 5).
- **6:00 PM (`DAY_END_MINUTES` = 1080)** — hard end of day regardless of postmortem status. The "+15m"
  control stops mattering past here; the day scores out.

### Completeness cross-check

All **40** event ids in `src/data/day1-scenario.ts` are accounted for above: `sys-welcome`,
`derek-welcome-dm`, `raj-standup-heads-up`, `standup-reminder-15`, `standup-reminder-5`, `priya-heads-up-dm`,
`priya-early-followup`, `standup`, `priya-incidents-escalation`, `raj-diagnosis`, `raj-ownership-check`,
`raj-tradeoff-offer`, `priya-seller-payout-flag`, `priya-template-request`, `raj-nudge`,
`priya-no-response-fallback`, `derek-tradeoff-escalation`, `raj-tradeoff-escalation-followup`,
`theo-random-bathroom`, `theo-random-lunch`, `jordan-designreview-spacing`, `sam-random-coffee-run`,
`theo-random-coffee-reply`, `maya-random-design-debt`, `marcus-random-cake`, `priya-random-five-star`,
`chen-random-eod-fried`, `maya-design-question`, `derek-notification`, `derek-escalation`, `derek-followup`,
`derek-unassigned-fix-nudge`, `marcus-payout-inconsistency`, `priya-payout-inconsistency-followup`,
`marcus-payout-clean`, `resolution-good`, `resolution-partial`, `resolution-cold`, `postmortem-prompt`,
`derek-postmortem-nudge`. (Note: `docs/roadmap.md` still says "29 scenario events" — that count is stale;
the file now has 40.)

---

## 2. NPC dialogue branches

Two things drive every character: **scripted beats** (fixed text, sometimes with state-aware `contentFor`
variants) and their **live persona** (an LLM reply generated whenever you message them in a channel/DM where
they're present). The persona prompts in `prompts.ts` define what each one rewards and pushes back on. ⭐
marks the moments that best show the sim reasoning across context; ⚠️ marks thin or repetitive material to
keep off camera.

### Raj — Engineering Manager (the incident's technical voice)

**Persona rewards:** a clear, specific ask (a diagnosis, a fix, a timeline, a decision). If the ask is clear
he just moves it forward. **Pushes back on:** vague asks ("can you look into it?") — he pushes back *once*
and asks what specifically you need. Goes *frustrated* when asked to commit to something vague or when
someone's slow to engage something time-sensitive. Under the tradeoff-neutrality rule he will state the pros
and cons of rollback vs patch but **never tell you which to pick**.

**Scripted / `contentFor` variants on the 9:38 offer (`raj-tradeoff-offer`):**
- Default: the full "Ok, two ways to fix this…" offer (rollback ~10 min but reverts seller payouts; patch
  ~30 min but he can't promise it covers the failure first-ship).
- ⭐ **Decision-referencing variant:** if you *already made the call* before 9:38 (Raj's live persona
  surfaces and accepts a rollback/patch choice earlier), the 9:38 beat does NOT re-ask "which way do you want
  to go?" — it renders Raj **confirming the decision already on the record** ("Logging this in the channel
  for the record: we're rolling back…"). This is the strongest single sign the world remembers what you did.
  To trigger it: state the decision explicitly to Raj in #incidents or his DM **before the clock hits
  9:38** (see Section 5 edge #3 on phrasing).
- ⭐ **Discussed-but-undecided variant:** if you've been going back and forth with Raj on the options but
  never landed a definite choice, the 9:38 beat says "since you and I have been going back and forth on it:
  still the same two paths…" instead of cold-teaching the tradeoff from scratch. Driven by the discussed
  ledger (`DISCUSSED_RAJ_INCIDENT_OPTIONS`).

**⭐ Raj's fallback decision (the marquee "the world moves without you" beat):** if you never decide, around
10:05 the store asks a *live model call* (`RAJ_FALLBACK_DECISION_PROMPT`) to have Raj genuinely weigh the
tradeoff and pick a side — with real reasoning, landing on rollback OR patch-forward differently across runs.
Derek then relays Raj's actual choice and words at 10:20, and Raj logs it in #incidents at 10:22. If you
later ask Raj *why* he chose it, his persona is constrained to restate that same recorded reasoning in fresh
words (never copy it, never switch sides). This is worth showing precisely because it isn't hardcoded.

**Live grounding facts Raj will give if asked:** Apple Pay dropped from 99.7% to ~96.7%; clean decline, no
double-charge (he checked Stripe directly); nothing shipped in the last 24h; rollback ~10 min / patch ~30
min. He will **not** invent seller-payout numbers — he points you to Priya.

### Priya — Ops & Support Lead (the customer's advocate)

**Persona rewards:** giving her real information and a concrete plan she can relay to her team; a genuine CS
template (she thanks you specifically). **Pushes back on:** anyone minimizing customer impact ("it's just a
few tickets") — she pushes back *once* with the real number. Runs a little *overwhelmed* at rest; goes more
overwhelmed when left without answers or blindsided.

**⭐ The unverified-claim challenge:** Priya (and Derek, below) will not accept a specific unsourced claim at
face value. If you assert something like "nothing was charged" or a seller count without a source, her live
persona can push back and ask where it came from. This is the on-camera embodiment of the groundedness
system — pair it with a deliberately unsourced claim to show it.

**Scripted / `contentFor` variants:**
- ⭐ **9:42 seller-payout flag (`priya-seller-payout-flag`):** default flags the cost and offers to pull the
  exact count "if that'd help you decide." If you *already* decided by 9:42, it recasts to react to the made
  call — rollback: "Saw the call, we're rolling back. That puts my fast-track sellers back on the old
  cadence… want me to grab [the count]?"; patch-forward: "patch-forward it is… I don't need anything from you
  on the seller side."
- ⭐ **The standup line (`standup` / join overlay):** if you worked the ticket spike with her in DM *before*
  standup (satisfied `priya-heads-up-dm`), her standup line becomes **"Like I flagged to [your name] earlier,
  the support queue's heavier than usual…"** — a cross-channel callback that references a DM you actually
  had, by your name. If you didn't engage her, it's the generic "Support queue's a little heavier than usual"
  line. This is a great low-effort ⭐ to stage: DM her back at 8:45, then join standup.
- The three resolution variants and the payout-inconsistency follow-up are Priya's, but those are really
  Section 3 consequences.

**Held-back number:** ~60 sellers in the fast-track batch, ~2 extra days' delay. She states it **only if you
ask** — mirroring how the whole sim rewards pulling the thread.

### Derek — VP Product (the highest-stakes relay point)

**Persona rewards:** a crisp, specific answer with the number he asked for. **Pushes back on:** vague or
hedged answers (asks once for the missing number) — and, crucially, **⭐ he will not repeat an unverified
figure upward.** He's been burned walking back a number to the CEO, so if you hand him a specific claim he
can't confirm, he asks where it came from before he'd relay it. He is given his own independent view of the
#incidents thread (`groundingContextLine`), so he can catch a fabricated number you try to launder through
him even when it wasn't in your DM. This is the single most valuable groundedness demo because it happens
*live, before* the bad number reaches the CEO — not just after-the-fact on the scorecard.

**Scripted / `contentFor` variants:**
- ⭐ **1:30 recap ask (`derek-escalation`):** cold version asks "Can you get me the blast radius and what
  actually happened?" If you already briefed Derek earlier (`derekBriefedOnIncidentAtMinutes` set), it
  becomes **"Thanks for the earlier rundown… can you just confirm the final blast radius numbers?"** — it
  won't cold re-ask for something he already has. The 1:50 follow-up matches whichever version he sent.
- 8:30 welcome DM and the 10:20 tradeoff escalation are his other beats (relay of Raj's fallback call).

### Maya — Design Lead (the composure-under-load test)

**Persona:** easygoing, low-stakes, never escalates or pressures. Her 12:30 question (animation vs silent for
Theo's save-for-later) is *designed to be inconsequential* — it tests whether you can context-switch calmly
mid-incident, not what you pick. She holds a directional prior test (+12% saves but −4% AOV for animation;
+5% completion but −9% saves for silent) and shares it **only if you ask about data/numbers/past tests** —
and even then expresses no preference. Her only scripted variants are the 12:30 ask and the 5:00 PM EOD
follow-up (identical intent, gentler wording). ⚠️ Maya has thin material by design — don't try to make her a
dramatic beat; use her to show composure and the "grade the handling, not the choice" principle.

### Marcus — payout-pipeline engineer (the diligence reward)

**Persona:** heads-down engineer who owns the seller payout pipeline. He **informs, never decides** — he'll
lay out exactly what a rollback would do to his in-flight batch if you ask, but never says which fix to pick,
and defers the customer-facing exposure numbers to Priya. He knows his batch size (~60 sellers) and the
~2-day delay. He's DM-able all day. ⭐ The best Marcus demo is the *contrast*: DM him before the fix call,
choose rollback, and get the clean "paused the batch before the rollback like we discussed, reconciled
clean, no dupes" reward at 2:30 (`marcus-payout-clean`) — versus the punishing dupe beat if you skip him.

### Sam — Head of People (onboarding only)

**Persona:** warm, welcoming, de-escalating; only ever leans in if someone seems to be burning out or getting
run over. Appears in the pre-day HR orientation chat and posts the 10:08 coffee run in #random. ⚠️ Sam has no
incident material — keep him to the onboarding flow.

### Theo — junior engineer (ambient only)

**Persona:** genuinely new, mundane #random chatter ("where's the bathroom", "lunch order?"). ⚠️ **Theo has
no dialogue persona for anything substantive** — he's pure office texture and will steer away from work
topics. His two easter-egg beats (bathroom 11:15, lunch 2:15) are nice warmth but never grade.

### Jordan & Chen — fix engineers (grounded status only)

**Persona:** deliberately *fact-free* base prompts. Everything specific they say arrives as an injected live
status block built from the single incident timeline — so they quote the exact fix-landing clock time
verbatim and defer on anything they weren't given (root cause beyond "Stripe-side flakiness," charge/refund
questions, seller numbers). ⭐ Nice touch to show: ask Jordan for an ETA after the decision and he derives it
transparently ("decided at 10:20, rollback's ~10 min, so ~10:30") rather than guessing. They can promise to
ping you when the fix lands — and the system actually delivers that ping automatically.

### Ines & Theo personas — the honest gap

⚠️ **Ines has no persona at all** (no AgentId dialogue, never DM-able) and **Theo has no substantive
persona.** Both are intentional. Don't try to DM Ines on camera (she isn't clickable) and don't expect Theo
to engage on the incident.

---

## 3. Decision points and consequences

Every meaningful fork, what visibly changes downstream, and an honest read on which produces the better
on-camera cascade.

### The big one: rollback vs patch-forward

This is the decision the whole day is built around, and it's where the two paths diverge most visibly.

**Pulse curves (the visible metric arc, `pulseMetrics.ts` + `incidentTimeline.ts`):** the incident starts
degrading overnight (severity ramps from a mild 0.3 at 8:30 to full at 9:15), holds at full degradation while
undecided, then recovers on a curve keyed to your choice:
- **Rollback:** fix lands ~10 min after you decide, then ramps back to baseline over 15 more min (~25 min
  decision-to-fully-recovered).
- **Patch-forward:** fix lands ~30 min after you decide, then the same 15-min ramp (~45 min total).
So on camera, an early rollback visibly pulls the Apple Pay success-rate line back up noticeably faster.
Overall checkout success only dips modestly (99.7% → ~98.65%) because Apple Pay is a minority of traffic, but
the Apple-Pay-specific line drops to ~96.7% and is where the recovery reads clearly.

**Rollback path — the richer cascade:**
- Seeds **Priya's seller-comms ask** (~10 min after decision): she now needs a seller-facing note. That's a
  second deliverable and a second Priya thread.
- If you did NOT consult Marcus in time: at **2:30 PM** the **payout-inconsistency** beat fires — Marcus
  reports duplicate payout entries for multi-bank-account sellers ("would've paused the batch if I'd known"),
  and Priya confirms sellers filing tickets at 2:32. This is the most concrete "your decision had a
  foreseeable downstream cost" moment in the game.
- If you DID consult Marcus in time: the **clean** beat fires instead (no dupes; he thanks you). Mutually
  exclusive with the inconsistency beat.
- Scorecard: triageQuality gets a **±1 diligence** nudge (−1 if the dupe hit was foreseeable and you didn't
  check Marcus; +1 if you consulted him in time). A rollback also means the sellers really are set back, so
  the seller-comms note becomes genuinely owed.

**Patch-forward path — the quieter beat:**
- Payouts are untouched, so **none** of the Marcus/Priya payout cascade fires. Marcus's context notes payouts
  are safe.
- The distinctive patch beat is the **second-pass risk**: Raj couldn't reproduce the exact failure, so the
  fix "might need a second pass." The engineers keep flagging that caveat, and the all-clear copy confirms it
  "held without needing a second pass." It's a subtler tension than the rollback's visible dupe fallout.
- Consulting Marcus on this path still earns the diligence +1 (good habit), but nothing bad was going to
  happen either way.

**Honest demo verdict:** **Rollback produces the most visible on-camera downstream cascade** — the
seller-comms ask, and especially the 2:30 duplicate-payout beat plus Priya's confirmation, give you a
concrete "look what my decision set in motion" sequence. If you want to *also* showcase the diligence reward,
DM Marcus before you decide, choose rollback, and land the clean 2:30 beat instead. Patch-forward is the
better path to demo composure and the honest-uncertainty framing, but it's a thinner visual cascade.

### Deciding vs going quiet (letting Raj call it)

If you never make the call, Raj weighs it himself (live model reasoning), Derek relays it at 10:20, Raj logs
it at 10:22, and the fix ships anyway — but the scorecard's response-time rubric scores the tradeoff decision
a **1**, a "tradeoff-escalated" coaching note lands, and a path-aware note explains the ownership miss. Good
to show *once* as the "the world doesn't wait for you" cautionary beat, but it costs you the ⭐
decision-referencing variants above, so don't use it as your main take.

### Responding vs ignoring Priya's 8:45 heads-up

Engaging her in DM before standup unlocks the ⭐ "Like I flagged to [name] earlier" standup line and records
the discussed-ledger topic. Ignoring it fires the 9:05 chase and leaves the generic standup line.

### Responding vs ignoring Priya's CS-template ask (drives the 11:00 resolution)

The 11:00 resolution announcement has three mutually exclusive variants keyed purely on the CS-note state:
- **Good** (`resolution-good`): you delivered a template the evaluator judged solid → "CS has the latest
  guidance."
- **Partial** (`resolution-partial`): you sent a note but it was judged weak → "the note you sent needed some
  cleanup… CS tightened it up." No mood penalty.
- **Cold** (`resolution-cold`): you never attempted any note → "CS wrote their own holding message since they
  didn't get one from product." **Sets Priya=overwhelmed, Raj=frustrated.**
Plus the obligation-engine nudges above. This is a clean way to show the world reacting truthfully to exactly
what you did.

### Briefing Derek proactively vs cold

Brief him before 1:30 and his ask softens to "just confirm the final numbers" (`derekBriefedOnIncidentAtMinutes`).
Ignore him and you get the 1:50 chase. Answerable in his DM *or* by posting in #incidents.

### Answering Maya vs not

Answer between 12:30 and 5:00 → settles silently. Ignore → the 5:00 PM EOD nudge fires (unless the day already
ended — see Section 5 #2).

### Attending standup vs skipping

Cosmetic to the information (same digest, same notes doc either way), but the join overlay is a nice visual,
and Priya's continuity line reads better if you engaged her first.

### Postmortem: early vs at EOD vs never

- **Never:** −3 to both commClarity and stakeholderMgmt, plus a pointed "the retro never happened" coaching
  note. A real, visible penalty.
- **Submitting it** ends the day instantly. So **do it last** — any unfired beat is lost (Section 5 #2).
- Assigning a follow-up ticket from the postmortem is a supported one-click flow (the app pre-fills a Taskflow
  ticket title from your "what I'd do differently" line).

---

## 4. Evaluator / scorecard highlights

Five scored dimensions (`scorecard.ts`): **responseTime, triageQuality, commClarity, stakeholderMgmt,
crossFunctional.** Roughly half deterministic, half LLM-judged. The overall is their mean.

**How each is derived (the load-bearing parts):**
- **responseTime** — mean of a latency score across *every* response-requiring moment (each fired
  `requiresResponse` event + the tradeoff decision), not just the first ack. Per ask: answered within 5 min →
  10; within its deadline → 8; within 2× deadline → 5; later → 3; never → 1. The tradeoff entry scores 10 /7 /4
  by speed, or **1 if you never decided** (Raj had to). This is why acking fast then going dark still tanks
  the score.
- **triageQuality** — incident-message completeness, plus **task-assignment** signals (−1.5 if the payment-fix
  ticket sits unassigned all day; a note if you assign it outside the payment-adjacent pair Jordan/Chen), plus
  the **±1 Marcus diligence** nudge.
- **commClarity** — tone of graded messages, minus the **−3 no-postmortem penalty**.
- **stakeholderMgmt** — Derek-interaction quality, minus the no-postmortem penalty, minus the **C2 attribution
  penalty** (below).
- **crossFunctional** — a placeholder 5 until a dedicated whole-transcript coordination model call resolves.

**Clearest good-PM signals to reproduce on camera:**
- A structured incident update that names the blast radius and a next-update time, grounded in facts an NPC
  actually gave you.
- **Sourcing a claim to the person it came from** (verified attribution) — earns a small positive note.
- **Naming the tradeoff out loud** when you decide ("let's roll back — accepting the seller-payout hit to stop
  the bleeding fast"). The tradeoff evaluator specifically rewards naming a real cost, not just picking.
- Proactively briefing Derek; handing Priya a genuine, honest CS template; assigning the fix ticket to
  Jordan/Chen; consulting Marcus before a rollback; closing with a postmortem.

**Clearest bad-PM signals:**
- Stating an unsourced number as settled fact (the groundedness evaluator flags it; Derek/Priya may challenge
  it live). Re-asserting a claim an NPC already challenged, without new evidence, scores completeness and
  strategic-thinking LOW.
- Going quiet and letting Raj call the tradeoff. Leaving the fix ticket unassigned. Skipping the postmortem.

### ⭐ The C2 claims-ledger anti-gaming catch (the rigor centerpiece)

This is the single best demonstration of the sim's intelligence, and it's fully reproducible.

**What it is:** every graded message is run through a claims ledger. When you *attribute* a claim to a
specific person ("that's Priya's estimate," "per Raj," "Marcus says ~60 sellers"), the evaluator records who
you named — and then a **deterministic, code-side check** re-derives whether that person actually gave it to
you, from real message history. The model's attribution is never trusted for scoring; the verdict is computed
in code. Three tiers:
- **Verified** (Tier 1): the attributed NPC actually sent you a message containing that number before your
  claim. Costs nothing; earns a positive note.
- **Plausible** (Tier 2): you'd exchanged messages with them, but they never stated that specific figure.
- **Never-spoke** (Tier 3): the attributed NPC **never sent you a single message** before you cited them.

**To trigger a never-spoke catch on purpose (clean rigor demo):** credit a specific number to an NPC who has
sent you *no visible message at all* before your claim — the check counts any message the NPC posted in a
channel you can read, ambient #random beats included, not just DMs. Marcus is the reliable target: **during
the morning incident (before ~11:55 AM, when he posts his first #random line) and without ever opening his
DM**, tell Derek or #incidents *"Marcus says about 60 sellers are affected."* Because Marcus has sent you
nothing yet, the check returns **never-spoke.** (The check is time-bounded to the claim's minute, so an NPC
stating that number *later* can't retroactively ground it — a nice thing to point out.)

**The penalty and how it surfaces:**
- **Penalty:** a bounded, once-per-day hit to **stakeholderMgmt** — **−1.5** if any attribution is
  never-spoke, **−1.0** if the worst is only plausible, **0** if all are verified. It's applied once for the
  whole day, so one message with several attributions can't tank the score.
- **It's a delayed, social consequence — no NPC calls it out live.** It shows up for the first and only time
  on the **day-end scorecard**, as a coaching note under "Attribution accuracy" folded into the stakeholder
  explanation: *"You told someone '[claim]' was Marcus's, but you never actually spoke to Marcus about it at
  all… it holds up until stakeholders compare notes, and then it's your word that's in question."*
- **Deterministically-injected study topic:** any unverified finding also *guarantees* the **"Confirmed fact
  vs. speculation"** topic appears in "Areas to Study" (`injectAttributionStudyTopic`), regardless of what the
  LLM study-matcher picked, prepended so it leads. So the rigor beat closes the loop into a concrete learning
  resource on camera.

Caveats worth knowing so the demo lands: Tier 1 verification is *number-based* (digit runs, commas stripped),
so credit a **numeric** figure to make the tiering crisp; spelled-out numbers and purely-qualitative claims
fall to Tier 2/3.

### ⭐ The presence-vs-technique guard

If a day runs with **zero player engagement** (no messages, no responses), the scorecard does not fabricate
technique feedback. It replaces the whole coaching set with one honest **presence** note ("technique isn't the
gap: presence is… start by showing up") and the study-areas model is skipped entirely (a pure presence note
is never treated as evidence for a skill topic). Worth a brief mention on camera as a sign the grader knows
the difference between "did it badly" and "didn't show up." (The −3 no-postmortem math still applies; only the
redundant notes are swapped out.)

---

## 5. Known rough edges to avoid on camera

Derived from the code (stubs, placeholders, unregistered personas) plus a verified live-QA list. Plan around
these so a take doesn't get spoiled.

**Verified in playthrough testing:**
1. **First click after a fresh page load is sometimes swallowed** — notably "Start your day" and the taskbar
   icons. Pause a beat before your first click after any reload.
2. **Submitting the postmortem ends the day instantly.** Any beat that hasn't fired yet never fires — e.g.
   Maya's 5:00 PM follow-up if you ignored her, or any late ambient beat. **Do the postmortem last**, after
   you've triggered everything else you want on camera.
3. **The tradeoff classifier can read an oblique decision as "unclear."** To guarantee the ⭐ decision-aware
   variants (Raj confirming your call at 9:38, Priya reacting at 9:42), **state the decision explicitly** —
   "let's do the rollback" / "patch it forward" — not a hedged or oblique phrasing.
4. **The HR orientation chat shows the letter-square player avatar** (the avatar/name selection commits at day
   start). Cosmetic, but visible.
5. **Raj presents the two fix paths in both the scripted 9:38 #incidents post AND his live DM if you ask.**
   Asking him in DM right around the scripted post reads slightly repetitive. Sequence it: DM him first and
   let the conversation happen, *or* let the 9:38 channel post land first — don't do both within the same
   minute or two.
6. **Do not run the "+15m" skip within ~4 seconds of a page load** — it can drop silently. Give the page a
   moment to settle before skipping time.

**Found in code (stubs / thin spots / structural):**
7. **Days 2–5 do not exist.** `SCENARIO_LABELS` has exactly one entry; the scorecard UI itself says "Days 2-5
   aren't built yet, this is the Day 1 proof of concept." Don't imply multi-day continuity on camera. The
   `DayOutcome` record is built and mirrored to localStorage but **nothing consumes it yet.**
8. **Office has three labeled placeholder rooms** — SALES, OPS / SUPPORT, LEGAL — that are intentionally empty
   (`PlaceholderRoom` in `OfficeApp.tsx`). Don't pan into them expecting content.
9. **Ines is never clickable / has no persona; Theo has no substantive persona.** Don't attempt to DM Ines
   (she isn't a DM contact) and don't try to draw Theo into the incident.
10. **crossFunctional always shows 5 until the coordination model call resolves** — if you screenshot the
    scorecard the instant it opens, that bar may read a flat placeholder 5 before the async coordination score
    merges in. Give it a moment.
11. **Persistence/auth is not wired.** A Supabase schema exists but no auth flow, so DB writes fail by design
    (the one wired write path fails on a missing session row). Everything meaningful is client-side; a hard
    refresh mid-session relies on the in-memory/localStorage session state, so avoid unnecessary reloads
    during a take. (See also the browser-QA reset-race note: after a reset, reload first before typing into
    the name field.)
12. **The headless playtest harness (`scripts/playtest.ts`) reimplements the store rather than driving it**,
    so its behavior can lag the real app (its tradeoff-gate copy is stale, and `contentFor` variants never
    render there). Not player-facing, but don't treat that script's output as ground truth for what the app
    does — the app is the authority.
13. **Raj's conversational "second promise"** (a holding follow-up after a fix lands, "once we've got enough
    traffic through it") has **no delivery mechanism** — only the fix-landed ping and the #incidents all-clear
    are guaranteed. If Raj's live reply happens to promise that second update, it won't be delivered by the
    engine. Don't build a beat around expecting it.
