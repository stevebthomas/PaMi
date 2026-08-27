import { ChannelList } from "./ChannelList";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { FactChecklist } from "./FactChecklist";
import { useSimStore } from "@/store/simStore";

export function ChattrApp() {
  const difficulty = useSimStore((s) => s.difficulty);

  return (
    <div className="flex h-full min-h-0 w-full">
      <ChannelList />
      <div className="flex min-h-0 flex-1 flex-col">
        <MessageList />
        <MessageInput />
      </div>
      {difficulty === "easy" && <FactChecklist />}
    </div>
  );
}
