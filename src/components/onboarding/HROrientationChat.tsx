"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AGENT_TITLES, initialStateBag, type AgentId } from "@/lib/sim/types";
import { PixelAvatar } from "@/components/shared/PixelAvatar";
import { TypingDots } from "@/components/shared/TypingDots";

interface HrMessage {
  id: string;
  senderId: "sam" | "player";
  content: string;
}

const SAM_OPENER =
  "Hey! I'm Sam, I head up People here at BazaarLoop. Welcome aboard. Take a look at the rundown on the left, and ask me anything that's not covered there. Whenever you're ready, just hit \"Start your day\" over there to jump in.";

let idCounter = 0;
function makeId(): string {
  idCounter += 1;
  return `hr-${Date.now()}-${idCounter}`;
}

async function requestSamReply(history: HrMessage[]): Promise<string | null> {
  try {
    const res = await fetch("/api/agents/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "sam" as AgentId,
        history: history.map((m) => ({ senderId: m.senderId, content: m.content })),
        state: initialStateBag,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.content ?? null;
  } catch {
    return null;
  }
}

/** The interactive Sam chat panel: meant to sit side by side with the
 * static WelcomeScreen recap. Starting the day happens from that panel's
 * button, not from here, so the player can chat as much or as little as
 * they want without it gating anything. */
export function HROrientationChat() {
  const [messages, setMessages] = useState<HrMessage[]>([
    { id: makeId(), senderId: "sam", content: SAM_OPENER },
  ]);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pending]);

  async function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || pending) return;

    const playerMsg: HrMessage = { id: makeId(), senderId: "player", content: trimmed };
    const nextHistory = [...messages, playerMsg];
    setMessages(nextHistory);
    setValue("");
    setPending(true);

    const reply = await requestSamReply(nextHistory);
    setPending(false);
    if (reply) {
      setMessages((prev) => [...prev, { id: makeId(), senderId: "sam", content: reply }]);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border-hairline bg-surface">
      <div className="flex items-center gap-2 border-b border-border-hairline bg-muted px-3 py-2">
        <PixelAvatar agentId="sam" sizeClassName="h-7 w-7" />
        <div>
          <div className="text-label font-semibold text-text-primary">Sam</div>
          <div className="text-label text-text-secondary">{AGENT_TITLES.sam}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {messages.map((m) => (
          <div key={m.id} className="mb-3 flex gap-2">
            <PixelAvatar agentId={m.senderId} sizeClassName="h-8 w-8" />
            <div className="min-w-0">
              <div className="text-body font-semibold text-text-primary">
                {m.senderId === "sam" ? "Sam" : "You"}
              </div>
              <p className="whitespace-pre-wrap text-body leading-snug text-text-primary">{m.content}</p>
            </div>
          </div>
        ))}
        {pending && (
          <div className="mb-3 flex items-center gap-2 text-label italic text-text-secondary">
            <PixelAvatar agentId="sam" sizeClassName="h-6 w-6" />
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
          placeholder="Ask Sam anything…"
          className="flex-1 resize-none rounded-md border border-border-hairline bg-surface px-3 py-2 text-body text-text-primary outline-none placeholder:text-text-secondary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || pending}
          className="shrink-0 rounded-md bg-primary px-3 py-2 text-body font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
