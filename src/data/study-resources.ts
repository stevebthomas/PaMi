/**
 * Curated, hand-vetted study resources matched to session topics — mirrors
 * the study_resources table in supabase/schema.sql. Read from here directly
 * rather than a live DB query, since nothing in this app has a working
 * Supabase write/session path yet (see project notes). Grow this list by
 * hand as new scenario days introduce new topics — never generate entries
 * live, that's the whole point of curating them.
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
];
