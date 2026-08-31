import { AGENT_NAMES, AGENT_TITLES, type AgentId, type ChannelId } from "@/lib/sim/types";
import { useSimStore } from "@/store/simStore";
import { PixelAvatar } from "@/components/shared/PixelAvatar";
import { dmContactForChannel } from "@/lib/sim/dmContacts";

const STATIC_DM_AGENT: Partial<Record<ChannelId, AgentId>> = {
  dm_raj: "raj",
  dm_priya: "priya",
  dm_derek: "derek",
};

export function DmHeaderBadge() {
  const activeChannel = useSimStore((s) => s.activeChannel);
  // Static DMs map directly; registry DMs (dm_jordan, …) resolve through the
  // same DM_CONTACTS lookup everything else uses: no per-engineer branch.
  const agentId = STATIC_DM_AGENT[activeChannel] ?? dmContactForChannel(activeChannel)?.agentId;
  if (!agentId) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="text-right leading-tight">
        <div className="text-label font-semibold text-text-primary">{AGENT_NAMES[agentId]}</div>
        <div className="text-caption text-text-secondary">{AGENT_TITLES[agentId]}</div>
      </div>
      <PixelAvatar agentId={agentId} sizeClassName="h-7 w-7" />
    </div>
  );
}
