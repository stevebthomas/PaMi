"use client";

import { useSimStore } from "@/store/simStore";

/** A plain personal scratchpad: no AI involved. Text lives in the sim
 * store, so it survives closing/reopening the window like every other
 * app's data, without needing any debounce (it's already an in-memory
 * write, not an I/O call). */
export function NotesApp() {
  const notesText = useSimStore((s) => s.notesText);
  const setNotesText = useSimStore((s) => s.setNotesText);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-canvas">
      <div className="shrink-0 border-b border-border-hairline px-3 py-1.5 text-label text-text-secondary">
        Private. Only you see this
      </div>
      <textarea
        value={notesText}
        onChange={(e) => setNotesText(e.target.value)}
        placeholder="Jot down whatever you want to remember as the day unfolds…"
        className="notes-paper h-full min-h-0 w-full flex-1 resize-none px-3 py-2 text-body leading-6 text-text-primary outline-none placeholder:text-text-secondary"
      />
    </div>
  );
}
