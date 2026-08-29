import { useEffect, useRef } from "react";
import { AGENT_NAMES } from "@/lib/sim/types";
import { formatSimTime, useSimStore } from "@/store/simStore";
import { PixelAvatar } from "@/components/shared/PixelAvatar";
import { TypingDots } from "@/components/shared/TypingDots";

export function MessageList() {
  const activeChannel = useSimStore((s) => s.activeChannel);
  const messages = useSimStore((s) => s.messages).filter((m) => m.channel === activeChannel);
  const pendingReplyFrom = useSimStore((s) => s.pendingReplyFrom);
  // Only show the indicator when the pending reply actually belongs to the
  // channel currently on screen — otherwise switching channels mid-reply
  // would show "X is typing" somewhere X isn't actually replying.
  const pendingReplyChannel = useSimStore((s) => s.pendingReplyChannel);
  const showTyping = pendingReplyFrom !== null && pendingReplyChannel === activeChannel;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, showTyping]);

  return (
    <div className="pixel-scrollbar flex-1 overflow-y-auto p-3">
      {messages.length === 0 && (
        <p className="mt-6 text-center text-sm text-ink-soft">Nothing here yet.</p>
      )}
      {messages.map((m) => {
        // System-voice messages (the 8:30 welcome, the 9:00 standup digest,
        // resolution updates, the postmortem prompt, Derek-DM notification
        // lines) are the sim's own narrator/ambient voice, not a coworker
        // typing — give them a visually distinct treatment so the register
        // reads differently at a glance. Keyed strictly on senderId ===
        // "system" so NPC dialogue and player messages stay pixel-identical
        // to before.
        const isSystem = m.senderId === "system";
        return (
          <div key={m.id} className="mb-3 flex gap-2">
            <PixelAvatar agentId={m.senderId} sizeClassName="h-8 w-8" />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span
                  className={
                    isSystem
                      ? "text-sm font-semibold font-pixel text-ink-soft"
                      : "text-sm font-semibold text-ink"
                  }
                >
                  {AGENT_NAMES[m.senderId]}
                </span>
                <span className="text-[11px] text-ink-soft">{formatSimTime(m.sentAtSimMinutes)}</span>
              </div>
              {isSystem ? (
                <p className="whitespace-pre-wrap border-l-2 border-[#5b5470] bg-[#5b5470]/10 py-0.5 pl-2 text-sm italic leading-snug text-ink-soft">
                  {m.content}
                </p>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-snug text-ink">{m.content}</p>
              )}
            </div>
          </div>
        );
      })}
      {showTyping && pendingReplyFrom && (
        <div className="mb-3 flex items-center gap-2 text-xs italic text-ink-soft">
          <PixelAvatar agentId={pendingReplyFrom} sizeClassName="h-6 w-6" />
          <div className="pixel-border flex items-center bg-white px-2 py-1.5">
            <TypingDots />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
