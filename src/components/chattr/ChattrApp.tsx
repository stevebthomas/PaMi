import { ChannelList } from "./ChannelList";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { FactChecklist } from "./FactChecklist";
import { useSimStore } from "@/store/simStore";

export function ChattrApp() {
  const difficulty = useSimStore((s) => s.difficulty);

  // @container so the FactChecklist helper rail can drop out by WINDOW width
  // (see FactChecklist's own `hidden @2xl:flex`): the two rails are fixed-width
  // by design, so when the Chattr window is narrowed the helper panel is the
  // first thing sacrificed rather than crushing the message thread.
  return (
    <div className="@container flex h-full min-h-0 w-full">
      <ChannelList />
      <div className="flex min-h-0 flex-1 flex-col bg-surface">
        <MessageList />
        <MessageInput />
      </div>
      {difficulty === "easy" && <FactChecklist />}
    </div>
  );
}
