import { AGENT_NAMES, type AgentId, type ChannelId } from "./types";

/**
 * CHANNEL PRESENCE ROSTER — who is actually *present in / able to read* a
 * channel, as distinct from `CHANNEL_AGENTS` in relevance.ts, which answers a
 * different question ("who might reactively reply here, for routing"). The two
 * are deliberately NOT the same map and must not be conflated:
 *   - relevance's CHANNEL_AGENTS is a routing shortlist. It intentionally omits
 *     people who are in the room but don't drive a live generated reply (e.g.
 *     Marcus, who speaks in #incidents only via a scripted beat; Derek, who
 *     reads #incidents but answers from his own DM).
 *   - THIS roster is presence/awareness. It's the answer to "if an NPC replies
 *     in this channel, who else can see it / is in the room?" — the context an
 *     upcoming subtask (A3/A4) injects into NPC prompts so a persona knows who's
 *     watching. Getting Marcus into #incidents here (he is present, he posts the
 *     payout-inconsistency beat there) is exactly why this can't just reuse
 *     CHANNEL_AGENTS.
 *
 * Membership is derived from scenario evidence — who actually speaks in a
 * channel in src/data/day1-scenario.ts, plus what personas in
 * src/lib/agents/prompts.ts claim to read — with the rationale recorded per
 * channel below. Presence lists NPC AgentIds plus "player" where the player
 * participates; "system" is excluded on purpose (it's automated announcement
 * output, not a participant who reads or reacts).
 *
 * This data is plain and JSON-serializable by construction (arrays of string
 * ids), consistent with the persistence layer landing in a later subtask.
 */

/** Static (non-DM) channel membership. DM channels are resolved generically in
 * `presentInChannel` below, so they are intentionally absent here. */
const CHANNEL_PRESENCE: Record<
  "general" | "incidents" | "design-review" | "random",
  { present: AgentId[]; rationale: string }
> = {
  // #general is the company-wide channel. The system posts day-framing
  // announcements here and both Raj and Priya speak here in the scenario; as
  // an all-hands surface every named teammate is a member and can read it, so
  // presence is the full NPC cast plus the player.
  general: {
    present: ["raj", "priya", "derek", "maya", "theo", "jordan", "chen", "marcus", "player"],
    rationale:
      "Company-wide channel: Raj/Priya/system speak here in day1-scenario.ts, and as an all-hands surface the whole named cast reads it.",
  },
  // #incidents is the incident war room. Priya, Raj, and Marcus all speak here
  // in the scenario (Marcus via the scripted payout-inconsistency beat), and
  // Derek's persona explicitly says he watches this thread ("You just saw the
  // #incidents thread"). So presence is those four stakeholders plus the
  // player. Marcus MUST be here even though relevance.ts omits him from the
  // reactive-reply shortlist.
  incidents: {
    present: ["raj", "priya", "marcus", "derek", "player"],
    rationale:
      "Incident war room: Raj/Priya/Marcus all post here in day1-scenario.ts (Marcus via the payout-inconsistency beat) and Derek's persona states he watches this thread.",
  },
  // #design-review is where the redesign's design micro-decisions get settled.
  // Maya speaks here (Theo's save-for-later question). Raj's persona notes
  // Jordan is "blocked on a design review comment about mobile spacing," so
  // Jordan is in this channel; Theo's ticket is the subject Maya is helping
  // with, so he's present too. Not an incident surface, so Raj/Priya/Derek are
  // not members.
  "design-review": {
    present: ["maya", "jordan", "theo", "player"],
    rationale:
      "Design channel: Maya speaks here (day1-scenario.ts); Raj's persona puts Jordan on a design-review comment, and Theo's ticket is the subject Maya is helping with.",
  },
  // #random is the ambient social channel. Theo posts his low-key chatter here;
  // as a social channel the whole team is nominally in it, so presence is the
  // full NPC cast plus the player.
  random: {
    present: ["raj", "priya", "derek", "maya", "theo", "jordan", "chen", "marcus", "player"],
    rationale:
      "Social channel: Theo posts ambient chatter here (day1-scenario.ts); as #random the whole team is nominally a member.",
  },
};

/** True for any DM channel id. Every DM channel is `dm_${agentId}` — the static
 * DMs (dm_raj/dm_priya/dm_derek) and the registry DMs (dm_jordan/dm_chen/
 * dm_marcus) all share that shape, and the suffix is always a valid AgentId. */
function dmAgentId(channel: ChannelId): AgentId | null {
  if (!channel.startsWith("dm_")) return null;
  return channel.slice(3) as AgentId;
}

/**
 * Who is present in / can read a channel: the participant AgentIds plus the
 * player where the player takes part. For a DM this is exactly the two
 * participants — the one NPC and the player — resolved generically from the
 * `dm_${agentId}` channel id, so any current or future DM contact works with
 * no per-name wiring. Returns [] for an unknown channel id.
 */
export function presentInChannel(channel: ChannelId): AgentId[] {
  const dmAgent = dmAgentId(channel);
  if (dmAgent) return [dmAgent, "player"];
  const entry = CHANNEL_PRESENCE[channel as keyof typeof CHANNEL_PRESENCE];
  return entry ? [...entry.present] : [];
}

/**
 * The display names of the NPCs present in a channel (for injecting a roster
 * line into NPC prompts in a later subtask). Always excludes "player" and
 * "system". Pass the replying persona's id as `excluding` to also drop them,
 * since this is "who else is in the room with you" and a persona shouldn't see
 * itself listed in its own roster line. Order follows `presentInChannel`.
 */
export function presentNpcNames(channel: ChannelId, excluding?: AgentId): string[] {
  return presentInChannel(channel)
    .filter((id) => id !== "player" && id !== "system" && id !== excluding)
    .map((id) => AGENT_NAMES[id]);
}
