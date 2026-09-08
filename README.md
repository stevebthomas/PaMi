<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/pami_lockup_horizontal_white.png">
    <img alt="PaMi" src="public/brand/pami_lockup_horizontal_final.png" width="220">
  </picture>
</p>

<!-- INTRO DRAFT: awaiting owner's voice pass -->

At the end of the day you get a scorecard, and it quotes you back to yourself: *"somewhere around 40-50k in orders we've dropped since 2am."* You invented that figure hours earlier to make a point in a channel, it felt fine at the time, and now it's sitting in your evaluation next to the note "that's something you made up." That's PaMi. You play a brand-new PM at BazaarLoop, a fictional secondhand marketplace, working one live day inside a pixel-art desktop: Chattr for team chat with AI coworkers, Pulse for the metrics dashboard, Taskflow for tickets, Office to see who's actually at their desk, and Ask Claude when you don't know what a webhook is. Day 1 is a payments incident. Everything you type gets graded against what you were actually told.

<p align="center">
  <a href="https://youtu.be/kZLU4rqcg8I"><img alt="Watch the PaMi ad" src="docs/media/ad-cover.jpg" width="640"></a>
</p>

<p align="center"><sub>The ad — one player's Day 1, condensed. → https://youtu.be/kZLU4rqcg8I</sub></p>

## How a day actually plays

The clock starts at 8:30 AM and you advance it yourself. At 8:45 Priya (ops) DMs a low-key heads-up about overnight checkout tickets. At 9:15 she escalates in #incidents: 14 tickets in the last hour, all Apple Pay. Raj, your EM, digs in and reports the Stripe webhook returning 500s on about 3% of Apple Pay attempts. Then at 9:38 he hands you the actual decision: roll back last week's deploy, which is a sure ten-minute fix but reverts the faster seller payouts that shipped with it, or patch forward, which keeps payouts fast but takes half an hour and he can't promise it holds on the first ship. Neither is the right answer. The sim grades how you handle it, not which one you pick.

What it does grade is whether you found the part nobody told you about. Marcus is at his desk all day hardening the seller payout pipeline, and he's one DM away. Ask him before you decide and you learn a rollback reverts a payout batch mid-cycle; skip it and at 2:30 PM he shows up with duplicate payouts hitting sellers who have multiple bank accounts on file. If you never make the call at all, Raj makes it for you around 10:05 — a real model call weighing the two documented costs, not a coin flip — and Derek relays to you that your EM decided it himself. Day ends hard at 6:00 PM, postmortem or not.

Then the scorecard: five dimensions, roughly half computed in code and half judged by Sonnet. Response time is a step function off how fast you acknowledged the 9:15 escalation. The judged half has to emit a claims ledger first — every factual claim in your message tagged `GROUNDED`, `UNSOURCED`, or `CHALLENGED`, with a quoted source — before it's allowed to produce a score. Pulse readings are snapshotted onto each message at send time, so citing the dashboard is grounded by data path rather than by asking the model nicely. And every quote in the final scorecard is validated in code as a verbatim substring of one of your own messages; anything paraphrased or invented gets dropped rather than shown.

## Running it locally

Requires Node 20+ (Next.js 16) and an Anthropic API key.

1. `git clone <repo-url> && cd pm-simulator`
2. `npm install`
3. `cp .env.local.example .env.local`, then set `ANTHROPIC_API_KEY`
4. Optional: create a Supabase project, run `supabase/schema.sql`, and fill in `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The app runs fine without them.
5. `npm run dev`, then open http://localhost:3000

Other scripts: `npm run build`, `npm run lint`, `npm run playtest` (four Opus personas — new-to-product, seasoned PM, chaos, adversarial — driven through the real API routes), `npm run scenario-audit` (static LLM design review of the scenario content).

## What's under the hood

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand for all sim state, `@anthropic-ai/sdk` for every model call, Recharts behind Pulse. Model choice is per-agent and set in env: NPC personas (`RAJ_MODEL`, `PRIYA_MODEL`, `DEREK_MODEL`, `SAM_MODEL`, `ASK_CLAUDE_MODEL`) default to Haiku because they write short in-character chat replies, while `EVALUATOR_MODEL` defaults to Sonnet because scoring PM judgment against a transcript is the part worth paying for. Swap any of them to compare. A full day is a few dozen model calls. Sim state lives in the browser tab, so a refresh loses the session; only the finished `DayOutcome` record is mirrored to localStorage, and nothing reads it back yet.

## Repo notes

```
src/app/            /sim (the desktop), /api/agents/* and /api/help (model routes), /demo (see below)
src/components/     chattr, pulse, taskflow, office, askclaude, scorecard, onboarding, notes, reviews
src/store/          Zustand: simStore (state + clock), taskflowStore, windowStore, costStore
src/lib/sim/        incidentTimeline, pulseMetrics, worldCanon, dmContacts, scorecard, dayOutcome, types
src/lib/agents/     prompts.ts and the shared Anthropic client
src/data/           day1-scenario.ts (29 scripted events), study-resources
scripts/            playtest, scenario-audit, test-day-outcome
playtests/          adversarial gaming reports and findings logs
docs/               PRD.md, roadmap.md, technical-audit.md, day1-script-reference.md
supabase/           schema.sql
```

`src/app/demo/ad-mode` and `src/app/demo/day2` are filming scaffolding built for the ad. Every file in there opens with a banner saying so. Nothing in the real sim imports them and you can delete the whole `demo/` directory without touching the game.

`playtests/` and `docs/` are working artifacts, not marketing. The playtest reports say plainly where the evaluator got beaten, and `docs/technical-audit.md` and `docs/roadmap.md` list the coupling and shortcuts this README summarizes.

## Limitations

Only Day 1 exists — the types are day-keyed but every one of those records has exactly one entry, and Days 2-5 are a plan in `docs/roadmap.md`, not code. It needs your own API key, so playing costs real money, and there's no auth or rate limiting on any API route, so don't deploy it publicly with a key attached. The NPCs and the evaluator can still be gamed: three named exploits were found and fixed, and the most recent 25-attempt adversarial re-run held on those three but let 5 new attempts through, mostly an unconfirmed root cause stated as fact in a customer-support draft where the evaluator wasn't looking as hard. That report is in `playtests/adversarial-gaming-report.md` — it's an LLM auditing an LLM, which is its own caveat. There are no unit tests, no mobile layout, and no real player, student, or hiring manager has used this yet, so every claim about who it helps is still an assumption.
