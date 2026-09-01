# LEARNING_RESOURCES.md — Areas to Study source library

Curated external resources for the scorecard's "Areas to Study" matching system, organized by behavior/skill category. Each resource lists: title, URL, publisher, one-line description, and which categories it fits (a resource can fit more than one).

Paywall flags are marked explicitly — do not link a paywalled resource unless a free fallback is unavailable for that trigger.

---

## Category 1: Incident communication and management
- **The Atlassian Incident Management Handbook** — https://www.atlassian.com/incident-management/handbook — Atlassian — Full public playbook covering severity levels, roles, comms channels, and cadence. (also: 3, 5, 7)
- **Incident communication best practices** — https://www.atlassian.com/incident-management/incident-communication — Atlassian — Picking communication channels, status pages, and message templates. (also: 9)
- **Incident communication best practices: Keep stakeholders informed** — https://incident.io/blog/incident-communication-best-practices — incident.io — Severity-based routing, rigid update cadence, always stating when the next update arrives. (also: 5, 7)
- **Incident communication templates and examples** — https://www.atlassian.com/incident-management/incident-communication/templates — Atlassian — Ready-to-adapt message templates. (also: 9)
- **Incident Response Training** — https://response.pagerduty.com/training/courses/incident_response/ — PagerDuty — Severity levels, roles, call etiquette; "favor explicit and clear communication over all else." (also: 3)
- **Managing Incidents (SRE Book, Ch. 14)** — https://sre.google/sre-book/managing-incidents/ — Google SRE — Incident command structure, separating command/comms/operations roles. (also: 3)

## Category 2: Communicating tradeoff decisions under uncertainty
- **How to communicate tradeoffs so leaders will listen** — https://www.lennysnewsletter.com/p/how-to-communicate-tradeoffs-so-leaders — Lenny's Newsletter — **[PAYWALLED, subscriber-only]** — Making tradeoffs clear when a new priority threatens in-flight work. (also: 5)
- **2015 Letter to Amazon Shareholders (two-way door decisions)** — https://s2.q4cdn.com/299287126/files/doc_financials/annual/2015-Letter-to-Shareholders.PDF — Amazon — FREE FALLBACK for above. Bezos's reversible ("two-way door") vs. irreversible ("one-way door") decision framework. (also: 8)
- **My favorite decision-making frameworks** — https://www.lennysnewsletter.com/p/my-favorite-decision-making-frameworks — Lenny's Newsletter — **[PAYWALLED]** — SPADE and disagree-and-commit frameworks. (also: 8)
- **This will make you a better decision-maker (Annie Duke)** — https://www.lennysnewsletter.com/p/making-better-decisions-annie-duke — Lenny's Newsletter — FREE — Annie Duke's "3Ds" (Discover, Discuss, Decide) framework. (also: 8)
- **Disagree and commit** — https://en.wikipedia.org/wiki/Disagree_and_commit — Wikipedia — FREE — Committing to a decision after voicing disagreement, avoiding the consensus trap. (also: 3, 8)

## Category 3: Cross-functional coordination
- **What Is an Incident Commander?** — https://www.pagerduty.com/resources/incident-management-response/learn/what-is-incident-commander/ — PagerDuty — The coordinating role that directs resources across teams. (also: 5)
- **Different Roles** — https://response.pagerduty.com/before/different_roles/ — PagerDuty — IC, Deputy, Scribe, SME, Customer Liaison, Internal Liaison roles. (also: 1, 5, 9)
- **Effective Crisis Management** — https://www.productteacher.com/articles/effective-crisis-management — Product Teacher — Staying calm/focused/transparent, tackling one thread at a time, delegating.
- **How we respond to an incident** — https://www.atlassian.com/incident-management/handbook/incident-response — Atlassian — Opening comms, assessing, escalating, delegating roles. (also: 1)

## Category 4: Verifying claims before repeating them (reframe as "confirmed-fact vs. speculation")
- **Postmortem Culture: Learning from Failure (SRE Book, Ch. 15)** — https://sre.google/sre-book/postmortem-culture/ — Google SRE — Findings must be grounded in collected evidence, not memory or authority. (also: 6)
- **Example Postmortem** — https://sre.google/sre-book/example-postmortem/ — Google SRE — A worked postmortem whose timeline is reconstructed from sourced evidence, modeling attribution over assertion. (also: 6)
- **Statuses (Practical Guide to Incident Management)** — https://incident.io/guide/foundations/statuses — incident.io — Communicating only what's confirmed ("Investigating: we think something is wrong, but we're not sure what it is yet"). (also: 1, 9)
- **During an Incident** — https://response.pagerduty.com/during/during_an_incident/ — PagerDuty — Stating clearly when a cause is unconfirmed; being direct and factual rather than speculative. (also: 1)

## Category 5: Stakeholder management and expectation-setting
- **Internal Liaison** — https://response.pagerduty.com/training/internal_liaison/ — PagerDuty — Managing up during a crisis with regular structured status updates. (also: 1)
- **Stakeholder Communication and Management** — https://www.pagerduty.com/platform/incident-management/stakeholder-communication/ — PagerDuty — Proactive stakeholder updates so the response team can focus on resolution.
- **This Week #7: Effectively communicating about a failure to execs** — https://www.lennysnewsletter.com/p/this-week-7-effectively-communicating — Lenny's Newsletter — FREE — Framing bad news to leadership: be upfront, take responsibility, lead with what you learned.
- **It's all about ME (managing expectations)!** — https://www.pmi.org/learning/library/managing-stakeholder-expectations-proactively-define-7984 — PMI — Proactively defining and managing each stakeholder's expectations.

## Category 6: Postmortems and incident retrospectives
- **Postmortem Culture: Learning from Failure (SRE Book, Ch. 15)** — https://sre.google/sre-book/postmortem-culture/ — Google SRE — Foundational text on blameless postmortem culture. (also: 4)
- **The post-mortem problem** — https://incident.io/blog/the-post-mortem-problem — incident.io — Best postmortems written while the incident still stings; Swiss-cheese model over single-root-cause hunting.
- **A guide to post-mortem meetings** — https://incident.io/hubs/post-mortem/a-guide-to-post-mortem-meetings — incident.io — Facilitation guidance for learning-focused post-incident meetings.
- **How to conduct blameless postmortems after an incident** — https://www.pluralsight.com/resources/blog/tech-operations/how-conduct-blameless-postmortems-incident — Pluralsight — When to run a postmortem and building a culture of honest writeups.
- **Postmortem Process & Template** — https://response.pagerduty.com/after/post_mortem_process/ — PagerDuty — Open-source postmortem process and template.

## Category 7: Response time and triage discipline
- **Severity Levels** — https://response.pagerduty.com/before/severity_levels/ — PagerDuty — Classifying incidents by severity; "always assume the worst" when unsure. (also: 1)
- **What is an Incident?** — https://response.pagerduty.com/before/what_is_an_incident/ — PagerDuty — Severity can be determined later; priority is triggering the response process fast.
- **Incident communication best practices: Keep stakeholders informed** — https://incident.io/blog/incident-communication-best-practices — incident.io — "No update" is still an update; heartbeat cadence prevents "is it fixed?" pings. (also: 1)
- **Status Page best practices** — https://www.pagerduty.com/resources/outages/learn/status-page-best-practices/ — PagerDuty — The 15-minute window target for initial communication. (also: 1, 9)
- **What Is Analysis Paralysis in Product Management** — https://userpilot.medium.com/what-is-analysis-paralysis-in-product-management-and-how-can-pms-avoid-it-3363a8081dc6 — Userpilot — Anchoring to goals to avoid overanalysis. (also: 8)

## Category 8: Design/product tradeoff decisions with data
- **What to do about ambiguous design problems** — https://www.tannerchristensen.com/blog/what-to-do-about-ambiguous-design-problems/ — Tanner Christensen — Committing to action under ambiguity since most decisions are recoverable.
- **2015 Letter to Amazon Shareholders** — https://s2.q4cdn.com/299287126/files/doc_financials/annual/2015-Letter-to-Shareholders.PDF — Amazon — Two-way-door reversible decisions made quickly. (also: 2)
- **Overcoming analysis paralysis through effective decision-making** — https://blog.logrocket.com/product-management/overcoming-analysis-paralysis/ — LogRocket — Committing to a decision when data is noisy or contradictory. (also: 7)
- **This will make you a better decision-maker (Annie Duke)** — https://www.lennysnewsletter.com/p/making-better-decisions-annie-duke — Lenny's Newsletter — FREE — Deciding well when outcomes are uncertain. (also: 2)

## Category 9: Customer/seller/external-facing communication during an internal problem
- **Customer Liaison** — https://response.pagerduty.com/training/customer_liaison/ — PagerDuty — Notifying customers of current conditions with IC approval. (also: 3, 5)
- **Keeping your customers in the loop** — https://docs.incident.io/incidents/customer-updates — incident.io — Sending scoped, targeted customer updates during an incident.
- **Incident communication tips** — https://support.atlassian.com/statuspage/docs/incident-communication-tips/ — Atlassian — Own the problem, show empathy, apologize when necessary.
- **How to talk to customers during unplanned outages** — https://instatus.com/blog/customer-communication-during-outages-and-templates — Instatus — Honest, appropriately-scoped outage notification templates.

---

## Integration notes
- Every Lenny's Newsletter URL marked PAYWALLED has a FREE FALLBACK listed in the same category — never link a paywalled resource as the sole match for a trigger.
- Category 4 is intentionally framed around incident-response "confirmed vs. speculative" discipline, not generic fact-checking content — this is the correct framing for the unverified-attribution scoring trigger (C2).
- Resources tagged with multiple categories can be matched to multiple existing triggers where relevant, not just their primary category.
