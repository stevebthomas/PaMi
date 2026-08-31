import type { DayOutcome } from "@/lib/sim/types";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./client";

/**
 * Best-effort log of an Ask Claude question to the help_queries table.
 * No-ops when Supabase isn't configured. Note: this app doesn't yet create
 * real sim_sessions rows (no auth/session flow exists), so even with
 * Supabase configured this insert will fail on the help_queries.session_id
 * foreign key until that's wired up. The scorecard's "Areas to study"
 * section reads from local session state, not from this table, so it works
 * regardless.
 */
export async function logHelpQueryToSupabase(params: {
  sessionId: string;
  question: string;
  topicTag: string | null;
  askedAtSimMinutes: number;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const client = getSupabaseBrowserClient();
  if (!client) return;

  try {
    await client.from("help_queries").insert({
      session_id: params.sessionId,
      question: params.question,
      topic_tag: params.topicTag,
      asked_at_sim_minutes: params.askedAtSimMinutes,
    });
  } catch {
    // Best-effort only: local scorecard state doesn't depend on this succeeding.
  }
}

/**
 * Best-effort mirror of a DayOutcome (see src/lib/sim/types.ts) to the
 * day_outcomes table. No-ops when Supabase isn't configured. Same honest
 * caveat as logHelpQueryToSupabase above: this app doesn't yet create real
 * sim_sessions rows (no auth/session flow exists), and unlike help_queries,
 * day_outcomes.session_id isn't even declared as a foreign key for that
 * reason, but the table still has RLS enabled with an owner-style policy
 * keyed off sim_sessions, so this insert will fail under RLS until an
 * auth/session flow exists to satisfy that policy. The real, working
 * persistence for DayOutcome today is src/lib/sim/outcomeStore.ts
 * (localStorage); this is purely a best-effort mirror for when a backend
 * exists to receive it.
 */
export async function logDayOutcomeToSupabase(sessionId: string, outcome: DayOutcome): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const client = getSupabaseBrowserClient();
  if (!client) return;

  try {
    await client.from("day_outcomes").insert({
      session_id: sessionId,
      day: outcome.day,
      schema_version: outcome.schemaVersion,
      outcome,
    });
  } catch {
    // Best-effort only: local outcomeStore state doesn't depend on this succeeding.
  }
}
