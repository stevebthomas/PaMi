import { useState, type KeyboardEvent } from "react";
import { CHANNELS, type ChannelId } from "@/lib/sim/types";
import { useSimStore } from "@/store/simStore";
import { dmContactForChannel } from "@/lib/sim/dmContacts";

export function MessageInput() {
  // Per-channel drafts: keyed by ChannelId so switching channels shows that
  // channel's own in-progress text instead of one draft shared across every
  // channel/DM (see QA finding #10). Deliberately component state, NOT added
  // to persisted session state: a draft dying on refresh is accepted.
  const [drafts, setDrafts] = useState<Partial<Record<ChannelId, string>>>({});
  const activeChannel = useSimStore((s) => s.activeChannel);
  const sendPlayerMessage = useSimStore((s) => s.sendPlayerMessage);
  const pendingReplyFrom = useSimStore((s) => s.pendingReplyFrom);

  const value = drafts[activeChannel] ?? "";

  function setValue(next: string) {
    setDrafts((prev) => ({ ...prev, [activeChannel]: next }));
  }

  // Resolve the placeholder the same way ChannelList/DmHeaderBadge do:
  // static CHANNELS first, then the registry DM contact (Jordan/Chen/Marcus),
  // then the raw channel id only as a last resort (see QA finding #11).
  // dmContactForChannel is a plain id lookup (not availability-gated), so no
  // extra store subscription is needed to keep this reactive.
  const channelLabel =
    CHANNELS.find((c) => c.id === activeChannel)?.label ??
    dmContactForChannel(activeChannel)?.name ??
    activeChannel;

  async function handleSend() {
    if (!value.trim() || pendingReplyFrom) return;
    const toSend = value;
    const sendChannel = activeChannel;
    setDrafts((prev) => ({ ...prev, [sendChannel]: "" }));
    await sendPlayerMessage(sendChannel, toSend);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-border-hairline bg-surface p-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        placeholder={`Message ${channelLabel}…`}
        className="flex-1 resize-none rounded-md border border-border-hairline bg-surface px-3 py-2 text-body text-text-primary outline-none placeholder:text-text-secondary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
      />
      <button
        onClick={handleSend}
        disabled={!value.trim() || Boolean(pendingReplyFrom)}
        className="shrink-0 rounded-md bg-primary px-3 py-2 text-body font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send
      </button>
    </div>
  );
}
