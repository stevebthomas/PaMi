-- PM Simulator — Phase 0 + Phase 1 schema
-- Run this in the Supabase SQL editor after creating a project.

-- Users (handled by Supabase Auth, extended with profile)
create table if not exists profiles (
  id uuid references auth.users primary key,
  display_name text,
  email text,
  created_at timestamptz default now()
);

-- Simulation sessions
create table if not exists sim_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  status text default 'active', -- active, paused, completed
  current_day int default 1, -- 1-5
  current_time_minutes int default 510, -- 8:30 AM = 510 mins
  state jsonb default '{}', -- flexible state bag for consequences
  started_at timestamptz default now(),
  completed_at timestamptz
);

-- Scenario events (the scripted things that happen)
create table if not exists scenario_events (
  id uuid primary key default gen_random_uuid(),
  day int not null,
  trigger_time_minutes int not null, -- when in sim-day this fires
  trigger_condition jsonb, -- optional: only fires if state matches
  event_type text not null, -- 'chattr_message', 'notification', 'call_request'
  agent_id text not null, -- 'raj', 'priya', 'system', 'derek'
  channel text, -- 'general', 'incidents', 'dm_raj', etc.
  content text not null, -- the message or prompt template
  requires_response boolean default false,
  response_deadline_minutes int, -- how long player has to respond
  metadata jsonb default '{}'
);

-- Messages in Chattr (both AI and player)
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sim_sessions(id) on delete cascade,
  channel text not null,
  sender_id text not null, -- 'player', 'raj', 'priya', 'derek', 'system'
  content text not null,
  sent_at_sim_minutes int not null, -- in-sim timestamp
  created_at timestamptz default now()
);

-- Player response evaluations
create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sim_sessions(id) on delete cascade,
  message_id uuid references messages(id) on delete cascade,
  event_id uuid references scenario_events(id),
  scores jsonb not null, -- { tone: 8, speed: 6, completeness: 7, strategic_thinking: 5 }
  feedback text, -- AI-generated feedback
  created_at timestamptz default now()
);

-- Row Level Security: a player can only see/write their own session data
alter table profiles enable row level security;
alter table sim_sessions enable row level security;
alter table messages enable row level security;
alter table evaluations enable row level security;

create policy "profiles: read own" on profiles for select using (auth.uid() = id);
create policy "profiles: update own" on profiles for update using (auth.uid() = id);
create policy "profiles: insert own" on profiles for insert with check (auth.uid() = id);

create policy "sim_sessions: owner full access" on sim_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "messages: owner full access" on messages for all
  using (session_id in (select id from sim_sessions where user_id = auth.uid()))
  with check (session_id in (select id from sim_sessions where user_id = auth.uid()));

create policy "evaluations: owner full access" on evaluations for all
  using (session_id in (select id from sim_sessions where user_id = auth.uid()))
  with check (session_id in (select id from sim_sessions where user_id = auth.uid()));

-- scenario_events is shared reference content — readable by any authenticated user
alter table scenario_events enable row level security;
create policy "scenario_events: read all" on scenario_events for select using (true);

-- Questions asked to the "Ask Claude" glossary helper, logged for the
-- end-of-day "Areas to study" scorecard section.
create table if not exists help_queries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sim_sessions(id) on delete cascade,
  question text not null,
  topic_tag text, -- short category, derived from the AI response itself
  asked_at_sim_minutes int not null,
  created_at timestamptz default now()
);

alter table help_queries enable row level security;
create policy "help_queries: owner full access" on help_queries for all
  using (session_id in (select id from sim_sessions where user_id = auth.uid()))
  with check (session_id in (select id from sim_sessions where user_id = auth.uid()));

-- Curated, hand-vetted study links matched to session topics for the
-- end-of-day "Areas to study" section. Grown incrementally as new scenario
-- days introduce new topics — seeded by hand, not generated live, so links
-- stay reliable. The app's seed data currently lives in
-- src/data/study-resources.ts (mirrors this table) since there's no live
-- write path into Supabase yet; this table is here for when there is.
create table if not exists study_resources (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null unique, -- e.g. "http_status_codes", "webhooks"
  topic_label text not null, -- display name, e.g. "HTTP status codes"
  short_description text not null, -- 1 sentence on why this matters for a PM
  resources jsonb not null, -- array of { title, url, source } objects
  created_at timestamptz default now()
);

-- Shared reference content — readable by any authenticated user, same as scenario_events.
alter table study_resources enable row level security;
create policy "study_resources: read all" on study_resources for select using (true);

-- Best-effort mirror of DayOutcome (src/lib/sim/types.ts) — the clean,
-- structured "what actually happened today" record built once by
-- buildDayOutcome (src/lib/sim/dayOutcome.ts) and saved locally via
-- src/lib/sim/outcomeStore.ts (localStorage), which is the persistence
-- layer that actually works today. This table exists for when a backend
-- exists to receive it — see logDayOutcomeToSupabase in
-- src/lib/supabase/persist.ts.
--
-- session_id is deliberately NOT a foreign key to sim_sessions(id): this
-- app doesn't yet create real sim_sessions rows (no auth/session flow
-- exists), so a FK here would make every insert fail on referential
-- integrity before RLS even gets a say. It's still enabled below with the
-- same owner-style policy shape as the other tables, which means inserts
-- will fail under RLS (auth.uid() has nothing to match against
-- sim_sessions.user_id) until that auth/session flow exists — same honest
-- caveat as help_queries above.
create table if not exists day_outcomes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  day int not null,
  schema_version int not null,
  outcome jsonb not null,
  created_at timestamptz default now()
);

alter table day_outcomes enable row level security;
create policy "day_outcomes: owner full access" on day_outcomes for all
  using (session_id in (select id from sim_sessions where user_id = auth.uid()))
  with check (session_id in (select id from sim_sessions where user_id = auth.uid()));
