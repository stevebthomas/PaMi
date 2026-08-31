import { day1ScenarioEvents } from "@/data/day1-scenario";
import { hasPlayerAddressed } from "@/lib/sim/acknowledgment";
import { AGENT_NAMES, type AgentId } from "@/lib/sim/types";
import { useSimStore } from "@/store/simStore";
import { CheckSquare2, Square } from "lucide-react";

interface FactRow {
  text: string;
  checked: boolean;
}

/**
 * Easy-difficulty ambient memory aid: a live, per-person list of facts
 * people have told the player so far, crossed out once the player has
 * moved on from that message (same channel-based signal the acknowledgment
 * system uses, see hasPlayerAddressed). Tracks FACTS STATED, never
 * instructions or "you should" phrasing: this is a memory aid, not a
 * to-do list telling the player what's expected of them.
 */
export function FactChecklist() {
  const firedEventIds = useSimStore((s) => s.firedEventIds);
  const messages = useSimStore((s) => s.messages);

  const groups: { agentId: AgentId; rows: FactRow[] }[] = [];
  const groupIndex = new Map<AgentId, number>();

  day1ScenarioEvents.forEach((event) => {
    if (!event.facts || event.facts.length === 0) return;
    if (!firedEventIds.has(event.id)) return;

    const checked = hasPlayerAddressed(event, day1ScenarioEvents, messages);
    let idx = groupIndex.get(event.agentId);
    if (idx === undefined) {
      idx = groups.length;
      groupIndex.set(event.agentId, idx);
      groups.push({ agentId: event.agentId, rows: [] });
    }
    event.facts.forEach((text) => groups[idx!].rows.push({ text, checked }));
  });

  return (
    <div className="hidden h-full w-56 shrink-0 flex-col overflow-y-auto border-l border-border-hairline bg-canvas p-3 @2xl:flex">
      <div className="mb-2 text-label font-semibold uppercase tracking-wide text-text-secondary">WHAT YOU&apos;VE BEEN TOLD</div>
      {groups.length === 0 && <div className="text-label italic text-text-secondary">Nothing yet.</div>}
      {groups.map((group) => (
        <div key={group.agentId} className="mb-3">
          <div className="mb-1 text-label font-semibold text-text-primary">{AGENT_NAMES[group.agentId]}</div>
          <ul className="space-y-1">
            {group.rows.map((row, i) => (
              <li key={i} className="flex items-start gap-1.5 text-label leading-snug text-text-primary">
                {row.checked ? (
                  <CheckSquare2 className="mt-0.5 size-3.5 shrink-0 text-accent-green" aria-hidden />
                ) : (
                  <Square className="mt-0.5 size-3.5 shrink-0 text-text-secondary" aria-hidden />
                )}
                <span className={row.checked ? "text-text-secondary line-through" : ""}>{row.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
