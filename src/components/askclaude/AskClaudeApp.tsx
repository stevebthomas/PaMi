"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bot, Send } from "lucide-react";
import { useSimStore } from "@/store/simStore";
import { TypingDots } from "@/components/shared/TypingDots";
import { renderInline } from "@/components/shared/renderInline";
import { PixelAvatar } from "@/components/shared/PixelAvatar";

export function AskClaudeApp() {
  const messages = useSimStore((s) => s.askClaudeMessages);
  const pending = useSimStore((s) => s.askClaudePending);
  const sendAskClaudeMessage = useSimStore((s) => s.sendAskClaudeMessage);
  const [value, setValue] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pending]);

  async function handleSend() {
    if (!value.trim() || pending) return;
    const toSend = value;
    setValue("");
    await sendAskClaudeMessage(toSend);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-canvas">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {messages.map((m) => (
          <div key={m.id} className="mb-3 flex gap-2">
            {m.senderId === "assistant" ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Bot className="size-4" aria-hidden />
              </div>
            ) : (
              <PixelAvatar agentId="player" sizeClassName="h-8 w-8" />
            )}
            <div className="min-w-0">
              <div className="text-body font-semibold text-text-primary">
                {m.senderId === "assistant" ? "Ask Claude" : "You"}
              </div>
              <p className="whitespace-pre-wrap text-body leading-snug text-text-primary">{renderInline(m.content)}</p>
            </div>
          </div>
        ))}
        {pending && (
          <div className="mb-3 flex items-center gap-2 text-label italic text-text-secondary">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="size-3.5" aria-hidden />
            </div>
            <div className="flex items-center rounded-md border border-border-hairline bg-surface px-2 py-1.5">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border-hairline bg-surface p-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder="What does this term mean?"
          className="flex-1 resize-none rounded-md border border-border-hairline bg-surface px-3 py-2 text-body text-text-primary outline-none placeholder:text-text-secondary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || pending}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-body font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="size-4" aria-hidden />
          Send
        </button>
      </div>
    </div>
  );
}
