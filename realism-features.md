# Realism Features — Design Catalog

A running list of details in the sim designed to mirror real PM thought processes and workflows.
Purpose: (1) internal design reference, (2) source material for walkthrough script / LinkedIn content
highlighting "here's how we made this feel real."

---

## Feature: Task Assignment (Taskflow)

**Status:** Built

**What it is:**
Every task card shows two identity fields, matching real Jira conventions:
- **Reporter** — who filed the task. Auto-set based on which persona's message/action generated it.
- **Assignee** — who's doing it. Nullable. Player can assign, reassign, or leave open.

Assignment is a fast, visible action on the card itself (click avatar / click "assign") — not buried in a
settings menu. Matches how real Jira boards work.

**Why it's realistic:**
Real Jira boards (see Teams in Space reference screenshot) show assignee avatars front-and-center on the
card because "who's doing this right now" is the info people scan for. Reporter is secondary context,
usually visible on open but not always front-of-card.

**Why it matters for evaluation (not just visual polish):**

| Signal | What it reveals |
|---|---|
| Triage judgment | Does the player assign the payment bug to Raj (owns backend/payments) or to a convenient/wrong person? |
| Delegation load awareness | Does the player keep dumping tasks on their most responsive person, ignoring who else is available? |
| Cost of inaction | An unassigned critical bug is a decision, even if unintentional. Sitting too long past a threshold triggers ambient pressure (e.g. a Derek follow-up). |
| Premature action | Assigning before gathering enough info (e.g. before confirming root cause with Raj) may reflect jumping to action too early. |

**Scoring integration:**
Folded into the existing `triageQuality` dimension rather than a new standalone scorecard field (stays
path-flexible / outcome-based per existing evaluator philosophy — no single "correct" assignment order,
but patterns that reflect good vs. poor judgment). Domain-mismatch and "left unassigned past the ambient
pressure threshold" surface as coaching notes.

**Ambient pressure tie-in:**
The critical tradeoff-decision ticket, left unassigned too long, triggers a Derek DM nudge — consistent
with the "ambient pressure over explicit coaching" design principle. No tutorial popup saying "assign this
task" — the world just reacts if you don't.

---

## Feature: [next entry goes here]

**Status:**

**What it is:**

**Why it's realistic:**

**Why it matters for evaluation:**

**Scoring integration:**

**Ambient pressure tie-in:**

---

## Notes for walkthrough script

- This doc is the source list for the "realism deep dive" section of the walkthrough video.
- Frame each feature as: *here's the real PM behavior it mirrors, and here's why it's not just cosmetic.*
- Good candidates already in the sim to retroactively document here: fact-tracking checklist, ambient
  badges/tone shifts, jargon helper logging into "Areas to Study," multi-persona branching based on
  actual player input rather than keyword matching.
