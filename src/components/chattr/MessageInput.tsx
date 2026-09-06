import { useState, type KeyboardEvent, type Ref } from "react";
import { CHANNELS, type ChannelId } from "@/lib/sim/types";
import { useSimStore } from "@/store/simStore";
import { dmContactForChannel } from "@/lib/sim/dmContacts";

/**
 * Presentational core: the Chattr composer, driven entirely by props so it can
 * be rendered without a live session. `MessageInput` below is the
 * store-connected wrapper Chattr uses.
 *
 * Send semantics are exactly the connected component's: Enter (without Shift)
 * sends and Shift+Enter inserts a newline; the Send button and the Enter path
 * share one guard, so neither fires on empty/whitespace text or while sending
 * is blocked.
 */
export function MessageInputView({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder,
  textareaRef,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Fired by Enter (no Shift) and by the Send button, and only when there is
   * trimmed text and `disabled` is false. */
  onSend: () => void;
  /** Sending is blocked (the live app blocks while a reply is pending). */
  disabled?: boolean;
  placeholder: string;
  /** Optional handle on the real textarea. Unused by the live app; the ad-mode
   * filming route uses it to focus the field while a scripted line types. */
  textareaRef?: Ref<HTMLTextAreaElement>;
}) {
  const canSend = Boolean(value.trim()) && !disabled;

  function handleSend() {
    if (!canSend) return;
    onSend();
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
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        placeholder={placeholder}
        className="flex-1 resize-none rounded-md border border-border-hairline bg-surface px-3 py-2 text-body text-text-primary outline-none placeholder:text-text-secondary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
      />
      <button
        onClick={handleSend}
        disabled={!canSend}
        className="shrink-0 rounded-md bg-primary px-3 py-2 text-body font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send
      </button>
    </div>
  );
}

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
    // The view already applies this exact guard before calling onSend; kept
    // here so the store write stays protected on its own terms.
    if (!value.trim() || pendingReplyFrom) return;
    const toSend = value;
    const sendChannel = activeChannel;
    setDrafts((prev) => ({ ...prev, [sendChannel]: "" }));
    await sendPlayerMessage(sendChannel, toSend);
  }

  return (
    <MessageInputView
      value={value}
      onChange={setValue}
      onSend={handleSend}
      disabled={Boolean(pendingReplyFrom)}
      placeholder={`Message ${channelLabel}…`}
    />
  );
}
