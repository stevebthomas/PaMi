import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { AGENT_NAMES } from "@/lib/sim/types";
import { formatSimTime, useSimStore } from "@/store/simStore";
import { useDocsStore } from "@/store/docsStore";
import { getSimDoc } from "@/data/simDocs";
import { PixelAvatar } from "@/components/shared/PixelAvatar";
import { TypingDots } from "@/components/shared/TypingDots";
import { FileText } from "lucide-react";

export function MessageList() {
  const activeChannel = useSimStore((s) => s.activeChannel);
  const messages = useSimStore((s) => s.messages).filter((m) => m.channel === activeChannel);
  const pendingReplyFrom = useSimStore((s) => s.pendingReplyFrom);
  // Only show the indicator when the pending reply actually belongs to the
  // channel currently on screen: otherwise switching channels mid-reply
  // would show "X is typing" somewhere X isn't actually replying.
  const pendingReplyChannel = useSimStore((s) => s.pendingReplyChannel);
  const openDocRequest = useDocsStore((s) => s.openDocRequest);
  const recordDocOpened = useSimStore((s) => s.recordDocOpened);
  const showTyping = pendingReplyFrom !== null && pendingReplyChannel === activeChannel;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, showTyping]);

  return (
    <div className="flex-1 overflow-y-auto p-3">
      {messages.length === 0 && (
        <p className="mt-6 text-center text-body text-text-secondary">Nothing here yet.</p>
      )}
      {messages.map((m) => {
        // System-voice messages (the 8:30 welcome, the 9:00 standup digest,
        // resolution updates, the postmortem prompt, Derek-DM notification
        // lines) are the sim's own narrator/ambient voice, not a coworker
        // typing: give them a visually distinct treatment so the register
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
                      ? "text-body font-semibold text-text-secondary"
                      : "text-body font-semibold text-text-primary"
                  }
                >
                  {AGENT_NAMES[m.senderId]}
                </span>
                <span className="font-mono text-label tabular-nums text-text-secondary">{formatSimTime(m.sentAtSimMinutes)}</span>
              </div>
              {isSystem ? (
                <p className="whitespace-pre-wrap border-l border-border-hairline py-0.5 pl-2 text-body italic leading-snug text-text-secondary">
                  {renderInline(m.content)}
                </p>
              ) : (
                <p className="whitespace-pre-wrap text-body leading-snug text-text-primary">{renderInline(m.content)}</p>
              )}
              {/* Doc chip(s): open in the in-sim Docs app, never a real
                  download. Covers both the singular `attachment` field and
                  the plural `attachments` field (merged into one list here),
                  rendered ONLY when a chip's docId resolves in SIM_DOCS, so a
                  legacy persisted attachment carrying the old {label, href}
                  shape (no docId) silently renders nothing rather than
                  crashing. */}
              {[...(m.attachment ? [m.attachment] : []), ...(m.attachments ?? [])]
                .filter((a) => getSimDoc(a.docId))
                .map((a) => (
                  <button
                    key={a.docId}
                    type="button"
                    onClick={() => {
                      recordDocOpened(a.docId);
                      openDocRequest(a.docId);
                    }}
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border-hairline bg-surface px-2 py-1 text-label text-text-primary transition-colors hover:bg-muted"
                  >
                    <FileText className="size-3.5 text-text-secondary" aria-hidden />
                    {a.label}
                  </button>
                ))}
            </div>
          </div>
        );
      })}
      {showTyping && pendingReplyFrom && (
        <div className="mb-3 flex items-center gap-2">
          <PixelAvatar agentId={pendingReplyFrom} sizeClassName="h-6 w-6" />
          <div className="flex items-center rounded-md border border-border-hairline bg-surface px-2 py-1.5">
            <TypingDots />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

/** Inline emphasis for message content: `**bold**` and `*italic*` only —
 * no links, no headings, no block parsing. Single-pass split, returns React
 * nodes (no dangerouslySetInnerHTML), adapted from DocsApp's renderInline
 * so system-voice content like the 9:00 standup digest doesn't render
 * literal asterisks. */
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
