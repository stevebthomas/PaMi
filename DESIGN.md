# DESIGN.md — Rally Visual System

Source: research report on "professional with a Duolingo touch" direction, refined toward Brilliant.org specifically as the closest match. Feed this file to Claude Code on every UI task so it has a consistent target instead of defaulting to generic AI-tool aesthetics.

## Direction in one sentence
Credible-first, warm-second. Linear/Stripe/Notion-grade professional foundation, with warmth concentrated in feedback moments (the scorecard, encouraging microcopy) rather than spread across every surface.

---

## Color

**Canvas:** warm off-white, not clinical white. `#F7F6F4` (Notion-style warm background, reduces eye strain over a long session).

**Neutral ramp:** warm-gray, not cool-gray. Used for borders, secondary text, disabled states, card surfaces.
- Surface: `#FFFFFF` (cards sitting on the warm canvas)
- Border/hairline: `#E5E3DF`
- Text secondary: `#6B6B68`
- Text primary: `#1A1A18`

**Accent (one color, used sparingly):** a deep, desaturated green — Brilliant's "pear" direction, not Duolingo's saturated `#58cc02`. Target something like `#2F7D4F` to `#3D8A5C` range — confident, grown-up, still reads as "progress/success," and ties naturally to the product's own checkout-success-rate domain.
- Accent is used **only** for: primary CTAs, "progress/success" states, the scorecard's positive framing.
- Never used decoratively.

**Status semantics (separate from the accent):**
- Success / succeeded: accent green
- Failed / incident: `#D64545` (muted red, not Duolingo's saturated cardinal)
- Pending / warning: `#C9922A` (muted amber)

**Dark mode:** build from the same tokens, don't hand-author a separate palette. Canvas becomes a near-black warm gray (`#161513`), not pure black.

---

## Typography

**Family:** Geist (primary), Geist Mono (secondary). Free, open-source, Inter-adjacent but slightly warmer and less ubiquitous than Inter itself.

**Scale:**
- Body: 15–16px, weight 400, line-height ~1.5
- Headings: weight 600–700, slight negative letter-spacing at large sizes (-0.01 to -0.02em at 32px+)

**Tabular numerals — non-negotiable, apply everywhere a number appears:** dashboard metrics, scorecard values, ticket counts, timestamps. This is the single highest-impact, lowest-effort "this is serious software" signal from the research. Use `font-variant-numeric: tabular-nums` (or the Tailwind `tabular-nums` utility) on every numeric display.

**Monospace use:** Geist Mono reserved for ticket IDs, timestamps, and log-like metadata in Taskflow and Chattr — signals technical authenticity without looking like a terminal everywhere.

---

## Iconography

**lucide-react** — shadcn's default icon set. Clean line icons, no custom illustration, no character art, no pixel icons. Consistent stroke width throughout.

**Avatars:** simple geometric — flat-color circle with initials, or a simplified illustrated face (already validated direction from the Gemini mockup work). Never cartoon/mascot style.

---

## Components

**Elevation:** hairline borders (`1px solid` at the border-hairline color above), not drop shadows. Shadows are reserved, if used at all, for true overlays (modals, dropdowns) — never for flat elevation on cards.

**Radius vocabulary (keep to exactly these three):**
- Inputs/buttons: 8px
- Cards: 12px
- Status badges/pills: 9999px (full pill)

**Spacing:** strict 4px grid. All padding/margin/gap values are multiples of 4 (4, 8, 12, 16, 24, 32...).

**Density:** the ticket board (Taskflow) and chat (Chattr) should lean toward information density — this is where a technical audience actually evaluates seriousness. Don't over-pad for "cleanliness" at the cost of scannability.

---

## Dashboard (Pulse) specifically

**One primary metric per view, then progressive disclosure.** Lead with the single number that answers the top-level question (e.g., current checkout success rate), let the player drill into payment-method breakdown and history on demand rather than showing everything with equal weight simultaneously.

**Charts:** monochrome-leaning, not rainbow. Use the accent green for the "good" line/state, status-red only when actually showing a failure/incident. Sparkline-style minimalism (thin line, generous whitespace, no gridlines) over heavily gridded/decorated charts.

**Build with Tremor** (Tailwind + Recharts under the hood) for KPI cards and charts — fastest path to this look with no custom charting work.

---

## The scorecard (signature "Duolingo touch" moment)

This is the one place warmth is deliberately concentrated:
- Clean results-surface layout (think Stripe/Linear reporting, not a game-over screen)
- One clear headline outcome at the top
- Per-category scores with tabular numerals and a subtle status-colored progress indicator per category
- Per-category explanations with quoted evidence from the player's actual actions (already built — this is the existing feature that most directly matches Brilliant/Stripe-style "specific, honest" credibility)
- Competence-framed language ("Incident Response: Strong"), never points/gems/league language
- One restrained celebratory microinteraction is fine (a smooth progress-fill animation) — no confetti, no sound effects, no mascot

---

## Explicitly avoid
Glassmorphism/frosted blur, neumorphism, pixel/retro chrome (the direction being replaced), rainbow chart palettes, decorative drop shadows, saturated candy colors, mascots/character art, gems/hearts/league mechanics, sound effects and confetti-heavy celebration.

---

## Stack
Next.js + TypeScript + Tailwind + **shadcn/ui** (Radix primitives) + **Tremor** (dashboard/charts) + **Geist / Geist Mono** (fonts) + **lucide-react** (icons).
