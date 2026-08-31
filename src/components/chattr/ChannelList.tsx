import { CHANNELS, type ChannelId } from "@/lib/sim/types";
import { useSimStore } from "@/store/simStore";
import { availableDmContacts, dmChannelId } from "@/lib/sim/dmContacts";
import { useTaskflowStore } from "@/store/taskflowStore";

export function ChannelList() {
  const activeChannel = useSimStore((s) => s.activeChannel);
  const setActiveChannel = useSimStore((s) => s.setActiveChannel);
  const unreadChannels = useSimStore((s) => s.unreadChannels);
  // The registry predicate reads the same generic engine state Office does, so
  // a contact appears the instant they become available and drops when they
  // don't, driven purely by subscribing to those slices here.
  const stateBag = useSimStore((s) => s.stateBag);
  const firedEventIds = useSimStore((s) => s.firedEventIds);
  const tickets = useTaskflowStore((s) => s.tickets);

  const channels = CHANNELS.filter((c) => c.kind === "channel");
  const staticDms = CHANNELS.filter((c) => c.kind === "dm");
  // Static DM entries plus every registry contact whose predicate is currently
  // true. No Jordan/Chen-specific branch: this loop is over the registry.
  const dms: { id: ChannelId; label: string }[] = [
    ...staticDms.map((c) => ({ id: c.id, label: c.label })),
    ...availableDmContacts({ stateBag, firedEventIds, tickets }).map((c) => ({
      id: dmChannelId(c.id),
      label: c.name,
    })),
  ];

  return (
    <div className="pixel-scrollbar flex h-full w-44 shrink-0 flex-col overflow-y-auto border-r-2 border-ink bg-[#dfd6bd] p-2 text-body">
      <div className="mb-1 mt-1 font-pixel text-caption text-ink-soft">CHANNELS</div>
      {channels.map((c) => (
        <button
          key={c.id}
          onClick={() => setActiveChannel(c.id)}
          className={`mb-1 flex items-center justify-between rounded px-2 py-1 text-left ${
            activeChannel === c.id ? "bg-accent-chattr text-white" : "hover:bg-black/10"
          }`}
        >
          <span>{c.label}</span>
          {unreadChannels.has(c.id) && <span className="h-2 w-2 rounded-full bg-accent-danger" />}
        </button>
      ))}

      <div className="mb-1 mt-3 font-pixel text-caption text-ink-soft">DIRECT MESSAGES</div>
      {dms.map((c) => (
        <button
          key={c.id}
          onClick={() => setActiveChannel(c.id)}
          className={`mb-1 flex items-center justify-between rounded px-2 py-1 text-left ${
            activeChannel === c.id ? "bg-accent-chattr text-white" : "hover:bg-black/10"
          }`}
        >
          <span>{c.label}</span>
          {unreadChannels.has(c.id) && <span className="h-2 w-2 rounded-full bg-accent-danger" />}
        </button>
      ))}
    </div>
  );
}
