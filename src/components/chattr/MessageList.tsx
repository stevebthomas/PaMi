import { useEffect, useRef, type ReactNode } from "react";
import { AGENT_NAMES, type AgentId } from "@/lib/sim/types";
import { renderInline } from "@/components/shared/renderInline";
import { formatSimTime, useSimStore } from "@/store/simStore";
import { useDocsStore } from "@/store/docsStore";
import { resolveSimDoc } from "@/data/simDocs";
import { PixelAvatarView } from "@/components/shared/PixelAvatar";
import { TypingDots } from "@/components/shared/TypingDots";
import { FileText } from "lucide-react";

/** One rendered row in the thread. Everything is pre-resolved by the caller
 * (name, formatted time, body nodes, chip handlers) so the list itself stays
 * free of store and doc-registry lookups. */
export interface MessageListItem {
  id: string;
  /** Drives the avatar sprite and, for the caller's convenience, nothing else. */
  agentId: AgentId;
  /** Display name in the header row. */
  name: string;
  /** Formatted timestamp, e.g. "9:14 AM". */
  timeLabel: string;
  /** Message body, already inline-rendered. */
  body: ReactNode;
  /** System-voice treatment (muted, italic, hairline rule) rather than the
   * normal coworker-dialogue treatment. */
  system?: boolean;
  /** Document chips rendered under the body. */
  attachments?: { key: string; label: string; onOpen: () => void }[];
}

/** Presentational core: the Chattr thread, driven entirely by props so it can
 * be rendered without a live session. `MessageList` below is the
 * store-connected wrapper Chattr uses. */
export function MessageListView({
  messages,
  typingAgentId = null,
  playerSpriteId = null,
}: {
  messages: MessageListItem[];
  /** When set, the "someone is typing" row renders under the thread with that
   * persona's avatar. */
  typingAgentId?: AgentId | null;
  /** Which PLAYER_SPRITES option to draw for `agentId === "player"` rows. */
  playerSpriteId?: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typingAgentId]);

  return (
    <div className="flex-1 overflow-y-auto p-3">
      {messages.length === 0 && (
        <p className="mt-6 text-center text-body text-text-secondary">Nothing here yet.</p>
      )}
      {messages.map((m) => (
        <div key={m.id} className="mb-3 flex gap-2">
          <PixelAvatarView agentId={m.agentId} sizeClassName="h-8 w-8" playerSpriteId={playerSpriteId} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span
                className={
                  m.system
                    ? "text-body font-semibold text-text-secondary"
                    : "text-body font-semibold text-text-primary"
                }
              >
                {m.name}
              </span>
              <span className="font-mono text-label tabular-nums text-text-secondary">{m.timeLabel}</span>
            </div>
            {m.system ? (
              <p className="whitespace-pre-wrap border-l border-border-hairline py-0.5 pl-2 text-body italic leading-snug text-text-secondary">
                {m.body}
              </p>
            ) : (
              <p className="whitespace-pre-wrap text-body leading-snug text-text-primary">{m.body}</p>
            )}
            {(m.attachments ?? []).map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={a.onOpen}
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border-hairline bg-surface px-2 py-1 text-label text-text-primary transition-colors hover:bg-muted"
              >
                <FileText className="size-3.5 text-text-secondary" aria-hidden />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {typingAgentId && (
        <div className="mb-3 flex items-center gap-2">
          <PixelAvatarView agentId={typingAgentId} sizeClassName="h-6 w-6" playerSpriteId={playerSpriteId} />
          <div className="flex items-center rounded-md border border-border-hairline bg-surface px-2 py-1.5">
            <TypingDots />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

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
  // Session-generated docs (e.g. the standup notes) resolve alongside the static
  // registry, so an attachment chip pointing at one renders and opens too.
  const sessionDocs = useSimStore((s) => s.stateBag.sessionDocs);
  const playerAvatarId = useSimStore((s) => s.stateBag.playerAvatarId);
  const showTyping = pendingReplyFrom !== null && pendingReplyChannel === activeChannel;

  const items: MessageListItem[] = messages.map((m) => {
    // System-voice messages (the 8:30 welcome, the 9:00 standup digest,
    // resolution updates, the postmortem prompt, Derek-DM notification
    // lines) are the sim's own narrator/ambient voice, not a coworker
    // typing: give them a visually distinct treatment so the register
    // reads differently at a glance. Keyed strictly on senderId ===
    // "system" so NPC dialogue and player messages stay pixel-identical
    // to before.
    const isSystem = m.senderId === "system";
    return {
      id: m.id,
      agentId: m.senderId,
      name: AGENT_NAMES[m.senderId],
      timeLabel: formatSimTime(m.sentAtSimMinutes),
      body: renderInline(m.content),
      system: isSystem,
      // Doc chip(s): open in the in-sim Docs app, never a real
      // download. Covers both the singular `attachment` field and
      // the plural `attachments` field (merged into one list here),
      // rendered ONLY when a chip's docId resolves in SIM_DOCS, so a
      // legacy persisted attachment carrying the old {label, href}
      // shape (no docId) silently renders nothing rather than
      // crashing.
      attachments: [...(m.attachment ? [m.attachment] : []), ...(m.attachments ?? [])]
        .filter((a) => resolveSimDoc(a.docId, sessionDocs))
        .map((a) => ({
          key: a.docId,
          label: a.label,
          onOpen: () => {
            recordDocOpened(a.docId);
            openDocRequest(a.docId);
          },
        })),
    };
  });

  return (
    <MessageListView
      messages={items}
      typingAgentId={showTyping ? pendingReplyFrom : null}
      playerSpriteId={playerAvatarId}
    />
  );
}
