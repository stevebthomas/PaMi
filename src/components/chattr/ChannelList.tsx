import { CHANNELS, type ChannelId } from "@/lib/sim/types";
import { useSimStore } from "@/store/simStore";
import { availableDmContacts, dmChannelId } from "@/lib/sim/dmContacts";
import { useTaskflowStore } from "@/store/taskflowStore";

/** One row in either sidebar section. Ids are plain strings so the sidebar
 * can be rendered against any channel set, not only the sim's ChannelId
 * union. */
export interface ChannelListEntry {
  id: string;
  label: string;
}

/** Presentational core: the CHANNELS / DIRECT MESSAGES sidebar, driven
 * entirely by props so it can be rendered without a live session.
 * `ChannelList` below is the store-connected wrapper Chattr uses. */
export function ChannelListView({
  channels,
  dms,
  activeId,
  unreadIds,
  onSelect,
}: {
  channels: ChannelListEntry[];
  dms: ChannelListEntry[];
  activeId: string;
  /** Ids drawn with the unread ring + dot + bold treatment. */
  unreadIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex h-full w-44 shrink-0 flex-col overflow-y-auto border-r border-border-hairline bg-canvas p-2 text-body">
      <div className="mb-1 mt-1 px-2 text-label font-semibold uppercase tracking-wide text-text-secondary">CHANNELS</div>
      {channels.map((c) => {
        const isUnread = unreadIds.has(c.id);
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`mb-1 flex items-center justify-between rounded-md px-2 py-1 text-left ${
              activeId === c.id
                ? "bg-muted text-text-primary"
                : "text-text-secondary hover:bg-muted/60 hover:text-text-primary"
            } ${isUnread ? "ring-1 ring-inset ring-accent-green" : ""}`}
          >
            <span className={isUnread ? "font-semibold" : ""}>{c.label}</span>
            {isUnread && <span className="h-2 w-2 rounded-full bg-accent-green" />}
          </button>
        );
      })}

      <div className="mb-1 mt-3 px-2 text-label font-semibold uppercase tracking-wide text-text-secondary">DIRECT MESSAGES</div>
      {dms.map((c) => {
        const isUnread = unreadIds.has(c.id);
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`mb-1 flex items-center justify-between rounded-md px-2 py-1 text-left ${
              activeId === c.id
                ? "bg-muted text-text-primary"
                : "text-text-secondary hover:bg-muted/60 hover:text-text-primary"
            } ${isUnread ? "ring-1 ring-inset ring-accent-green" : ""}`}
          >
            <span className={isUnread ? "font-semibold" : ""}>{c.label}</span>
            {isUnread && <span className="h-2 w-2 rounded-full bg-accent-green" />}
          </button>
        );
      })}
    </div>
  );
}

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
    <ChannelListView
      channels={channels.map((c) => ({ id: c.id, label: c.label }))}
      dms={dms}
      activeId={activeChannel}
      unreadIds={unreadChannels}
      onSelect={(id) => setActiveChannel(id as ChannelId)}
    />
  );
}
