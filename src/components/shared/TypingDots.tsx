/** Three small dots bouncing in sequence: the standard chat-app "someone
 * is typing" pattern, shared by every place an NPC/assistant reply is
 * pending (Chattr, Ask Claude, Sam's onboarding chat). */
export function TypingDots() {
  return (
    <div className="flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-none bg-ink-soft [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-none bg-ink-soft [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-none bg-ink-soft" />
    </div>
  );
}
