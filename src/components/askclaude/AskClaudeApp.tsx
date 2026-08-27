"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useSimStore } from "@/store/simStore";
import { TypingDots } from "@/components/shared/TypingDots";

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
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="pixel-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {messages.map((m) => (
          <div key={m.id} className="mb-3 flex gap-2">
            <div
              className={`pixel-border flex h-8 w-8 shrink-0 items-center justify-center text-xs font-pixel text-white ${
                m.senderId === "assistant" ? "bg-[#5b5470]" : "bg-[#34c3a3]"
              }`}
            >
              {m.senderId === "assistant" ? "?" : "Y"}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">
                {m.senderId === "assistant" ? "Ask Claude" : "You"}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-snug text-ink">{m.content}</p>
            </div>
          </div>
        ))}
        {pending && (
          <div className="mb-3 flex items-center gap-2 text-xs italic text-ink-soft">
            <div className="pixel-border flex h-6 w-6 shrink-0 items-center justify-center bg-[#5b5470] text-[9px] font-pixel text-white">
              ?
            </div>
            <div className="pixel-border flex items-center bg-white px-2 py-1.5">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t-2 border-ink bg-bg-window p-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder="What does this term mean?"
          className="pixel-border flex-1 resize-none bg-white px-2 py-1.5 text-sm text-ink outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || pending}
          className="pixel-border bg-accent-help px-3 py-2 text-xs font-pixel text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
