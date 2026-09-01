/**
 * Curated, hand-vetted study resources matched to session topics: mirrors
 * the study_resources table in supabase/schema.sql. Read from here directly
 * rather than a live DB query, since nothing in this app has a working
 * Supabase write/session path yet (see project notes). Grow this list by
 * hand as new scenario days introduce new topics: never generate entries
 * live, that's the whole point of curating them.
 *
 * The library now also draws from LEARNING_RESOURCES.md (repo root), the
 * category-organized source list behind "Areas to study". Same ethos applies:
 * every link here is hand-picked and category-vetted, never dumped wholesale.
 * Two rules carried over from that file's integration notes:
 *   - Never link a PAYWALLED resource when a free fallback exists for the same
 *     trigger. In practice the two subscriber-only Lenny's Newsletter pieces
 *     are omitted entirely; their free fallbacks (the Amazon shareholder
 *     letter and the Annie Duke piece) are what appear below.
 *   - A resource that legitimately fits more than one behavior category can be
 *     reused across topics (e.g. the Amazon two-way-door letter under both
 *     tradeoff communication and deciding-with-data).
 * Each topic below is anchored to a behavior the sim actually scores or
 * coaches on (response time, triage, communication clarity, stakeholder
 * management, cross-functional coordination, the rollback-vs-patch-forward
 * tradeoff, the C2 attribution check, the postmortem flow, and the customer-
 * facing CS-template beat), so nothing here is generic PM filler.
 */
export interface StudyResourceLink {
  title: string;
  url: string;
  source: string;
}

export interface StudyResourceEntry {
  topicKey: string;
  topicLabel: string;
  shortDescription: string;
  resources: StudyResourceLink[];
}

export const STUDY_RESOURCES: StudyResourceEntry[] = [
  {
    topicKey: "http_status_codes",
    topicLabel: "HTTP status codes",
    shortDescription:
      "Understanding what error codes like 500 or 404 actually mean helps you triage technical incidents faster.",
    resources: [
      {
        title: "HTTP response status codes",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status",
        source: "MDN Web Docs",
      },
    ],
  },
  {
    topicKey: "webhooks",
    topicLabel: "Webhooks",
    shortDescription:
      "Webhooks are how systems like Stripe notify your app when something happens (e.g. a payment completes). A common failure point in checkout flows.",
    resources: [
      {
        title: "About webhooks",
        url: "https://docs.github.com/en/webhooks/about-webhooks",
        source: "GitHub Docs",
      },
    ],
  },
  {
    topicKey: "incident_communication",
    topicLabel: "Incident communication",
    shortDescription:
      "How to structure updates during a live incident so engineering, leadership, and customers all get what they need.",
    resources: [
      {
        title: "Incident communication best practices",
        url: "https://www.atlassian.com/incident-management/incident-communication",
        source: "Atlassian",
      },
      {
        title: "Incident communication best practices: Keep stakeholders informed",
        url: "https://incident.io/blog/incident-communication-best-practices",
        source: "incident.io",
      },
      {
        title: "The Atlassian Incident Management Handbook",
        url: "https://www.atlassian.com/incident-management/handbook",
        source: "Atlassian",
      },
      {
        title: "Incident communication templates and examples",
        url: "https://www.atlassian.com/incident-management/incident-communication/templates",
        source: "Atlassian",
      },
    ],
  },
  {
    topicKey: "ab_testing_significance",
    topicLabel: "A/B testing & statistical significance",
    shortDescription:
      "Understanding when a test result is real vs. random noise is core to making good ship/kill decisions on experiments.",
    resources: [
      {
        title: "What are A/B tests: a guide for product managers",
        url: "https://gopractice.io/product/ab-tests-guide-for-product-managers/",
        source: "GoPractice",
      },
    ],
  },
  {
    topicKey: "tradeoff_communication",
    topicLabel: "Communicating tradeoffs under uncertainty",
    shortDescription:
      "When Raj hands you the rollback-vs-patch-forward call, the win isn't just picking, it's naming the tradeoff out loud so leadership follows your reasoning and commits with you.",
    resources: [
      {
        title: "2015 Letter to Amazon Shareholders (two-way-door decisions)",
        url: "https://s2.q4cdn.com/299287126/files/doc_financials/annual/2015-Letter-to-Shareholders.PDF",
        source: "Amazon",
      },
      {
        title: "This will make you a better decision-maker (Annie Duke)",
        url: "https://www.lennysnewsletter.com/p/making-better-decisions-annie-duke",
        source: "Lenny's Newsletter",
      },
      {
        title: "Disagree and commit",
        url: "https://en.wikipedia.org/wiki/Disagree_and_commit",
        source: "Wikipedia",
      },
    ],
  },
  {
    topicKey: "cross_functional_coordination",
    topicLabel: "Cross-functional coordination",
    shortDescription:
      "A live incident pulls in engineering, support, and leadership at once. Directing that response, delegating clearly, and keeping one thread moving is the coordination work the day grades you on.",
    resources: [
      {
        title: "What Is an Incident Commander?",
        url: "https://www.pagerduty.com/resources/incident-management-response/learn/what-is-incident-commander/",
        source: "PagerDuty",
      },
      {
        title: "Different Roles (Incident Response)",
        url: "https://response.pagerduty.com/before/different_roles/",
        source: "PagerDuty",
      },
      {
        title: "Effective Crisis Management",
        url: "https://www.productteacher.com/articles/effective-crisis-management",
        source: "Product Teacher",
      },
      {
        title: "How we respond to an incident",
        url: "https://www.atlassian.com/incident-management/handbook/incident-response",
        source: "Atlassian",
      },
    ],
  },
  {
    topicKey: "confirmed_vs_speculation",
    topicLabel: "Confirmed fact vs. speculation",
    shortDescription:
      "When you pass a number or a cause up the chain, attribute it to the source it came from and flag anything still unconfirmed. Crediting a figure to someone who never gave it to you is a credibility risk that surfaces later.",
    resources: [
      {
        title: "Statuses (Practical Guide to Incident Management)",
        url: "https://incident.io/guide/foundations/statuses",
        source: "incident.io",
      },
      {
        title: "During an Incident",
        url: "https://response.pagerduty.com/during/during_an_incident/",
        source: "PagerDuty",
      },
      {
        title: "Example Postmortem",
        url: "https://sre.google/sre-book/example-postmortem/",
        source: "Google SRE",
      },
    ],
  },
  {
    topicKey: "stakeholder_management",
    topicLabel: "Stakeholder management & expectation-setting",
    shortDescription:
      "Keeping Derek and the rest of leadership informed on a rhythm, and framing bad news honestly, is what lets the response team focus. Going quiet is how a call that was yours ends up made for you.",
    resources: [
      {
        title: "Internal Liaison",
        url: "https://response.pagerduty.com/training/internal_liaison/",
        source: "PagerDuty",
      },
      {
        title: "Stakeholder Communication and Management",
        url: "https://www.pagerduty.com/platform/incident-management/stakeholder-communication/",
        source: "PagerDuty",
      },
      {
        title: "This Week #7: Effectively communicating about a failure to execs",
        url: "https://www.lennysnewsletter.com/p/this-week-7-effectively-communicating",
        source: "Lenny's Newsletter",
      },
      {
        title: "It's all about ME (managing expectations)!",
        url: "https://www.pmi.org/learning/library/managing-stakeholder-expectations-proactively-define-7984",
        source: "PMI",
      },
    ],
  },
  {
    topicKey: "postmortems",
    topicLabel: "Postmortems & incident retrospectives",
    shortDescription:
      "Closing the loop with a blameless, learning-focused writeup is part of the job, not an optional extra. Skipping the retro is a real gap the scorecard reflects.",
    resources: [
      {
        title: "Postmortem Culture: Learning from Failure (SRE Book, Ch. 15)",
        url: "https://sre.google/sre-book/postmortem-culture/",
        source: "Google SRE",
      },
      {
        title: "The post-mortem problem",
        url: "https://incident.io/blog/the-post-mortem-problem",
        source: "incident.io",
      },
      {
        title: "How to conduct blameless postmortems after an incident",
        url: "https://www.pluralsight.com/resources/blog/tech-operations/how-conduct-blameless-postmortems-incident",
        source: "Pluralsight",
      },
      {
        title: "Postmortem Process & Template",
        url: "https://response.pagerduty.com/after/post_mortem_process/",
        source: "PagerDuty",
      },
    ],
  },
  {
    topicKey: "triage_discipline",
    topicLabel: "Response time & triage discipline",
    shortDescription:
      "Acknowledging fast, classifying severity, and keeping a steady update cadence beats waiting for perfect information. Staying reachable all day matters as much as the first pickup.",
    resources: [
      {
        title: "Severity Levels",
        url: "https://response.pagerduty.com/before/severity_levels/",
        source: "PagerDuty",
      },
      {
        title: "What is an Incident?",
        url: "https://response.pagerduty.com/before/what_is_an_incident/",
        source: "PagerDuty",
      },
      {
        title: "Status Page best practices",
        url: "https://www.pagerduty.com/resources/outages/learn/status-page-best-practices/",
        source: "PagerDuty",
      },
      {
        title: "What Is Analysis Paralysis in Product Management",
        url: "https://userpilot.medium.com/what-is-analysis-paralysis-in-product-management-and-how-can-pms-avoid-it-3363a8081dc6",
        source: "Userpilot",
      },
    ],
  },
  {
    topicKey: "deciding_with_data",
    topicLabel: "Deciding under ambiguity",
    shortDescription:
      "The rollback-vs-patch-forward call has no clean answer and no perfect data. Learning to commit when the signal is noisy, on the recognition that most decisions are recoverable, is the skill under test.",
    resources: [
      {
        title: "What to do about ambiguous design problems",
        url: "https://www.tannerchristensen.com/blog/what-to-do-about-ambiguous-design-problems/",
        source: "Tanner Christensen",
      },
      {
        title: "Overcoming analysis paralysis through effective decision-making",
        url: "https://blog.logrocket.com/product-management/overcoming-analysis-paralysis/",
        source: "LogRocket",
      },
      {
        title: "This will make you a better decision-maker (Annie Duke)",
        url: "https://www.lennysnewsletter.com/p/making-better-decisions-annie-duke",
        source: "Lenny's Newsletter",
      },
      {
        title: "2015 Letter to Amazon Shareholders",
        url: "https://s2.q4cdn.com/299287126/files/doc_financials/annual/2015-Letter-to-Shareholders.PDF",
        source: "Amazon",
      },
    ],
  },
  {
    topicKey: "customer_communication",
    topicLabel: "Customer-facing communication during an incident",
    shortDescription:
      "When Priya needs something support can tell customers, the draft has to be honest, appropriately scoped, and free of promises the incident hasn't earned yet. Own the problem without overcommitting.",
    resources: [
      {
        title: "Customer Liaison",
        url: "https://response.pagerduty.com/training/customer_liaison/",
        source: "PagerDuty",
      },
      {
        title: "Keeping your customers in the loop",
        url: "https://docs.incident.io/incidents/customer-updates",
        source: "incident.io",
      },
      {
        title: "Incident communication tips",
        url: "https://support.atlassian.com/statuspage/docs/incident-communication-tips/",
        source: "Atlassian",
      },
      {
        title: "How to talk to customers during unplanned outages",
        url: "https://instatus.com/blog/customer-communication-during-outages-and-templates",
        source: "Instatus",
      },
    ],
  },
];
