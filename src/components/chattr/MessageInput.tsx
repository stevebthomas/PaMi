import { useState, type KeyboardEvent } from "react";
import { CHANNELS } from "@/lib/sim/types";
import { useSimStore } from "@/store/simStore";

export function MessageInput() {
  const [value, setValue] = useState("");
  const activeChannel = useSimStore((s) => s.activeChannel);
  const sendPlayerMessage = useSimStore((s) => s.sendPlayerMessage);
  const pendingReplyFrom = useSimStore((s) => s.pendingReplyFrom);

  const channelLabel = CHANNELS.find((c) => c.id === activeChannel)?.label ?? activeChannel;

  async function handleSend() {
    if (!value.trim() || pendingReplyFrom) return;
    const toSend = value;
    setValue("");
    await sendPlayerMessage(activeChannel, toSend);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t-2 border-ink bg-bg-window p-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        placeholder={`Message ${channelLabel}…`}
        className="pixel-border flex-1 resize-none bg-white px-2 py-1.5 text-sm text-ink outline-none"
      />
      <button
        onClick={handleSend}
        disabled={!value.trim() || Boolean(pendingReplyFrom)}
        className="pixel-border bg-accent-chattr px-3 py-2 text-xs font-pixel text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Send
      </button>
    </div>
  );
}
