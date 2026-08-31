import { useSimStore } from "@/store/simStore";
import { useDocsStore } from "@/store/docsStore";
import type { AppId } from "./Desktop";
import { AppIcon } from "@/components/shared/AppIcon";

const APPS: { id: AppId; label: string; enabled: boolean }[] = [
  { id: "chattr", label: "Chattr", enabled: true },
  { id: "pulse", label: "Pulse", enabled: true },
  { id: "taskflow", label: "Taskflow", enabled: true },
  { id: "askClaude", label: "Ask Claude", enabled: true },
  { id: "reviews", label: "Reviews", enabled: true },
  { id: "notes", label: "Notes", enabled: true },
  { id: "office", label: "Office", enabled: true },
  { id: "docs", label: "Docs", enabled: true },
];

/** Bottom dock, purely for opening/switching apps: system controls
 * (difficulty, +15m, battery, clock) live in StatusBar at the top instead,
 * matching how real desktop OSes split a top menu/status bar from a bottom
 * app dock. */
export function Taskbar({
  openApps,
  onSelectApp,
}: {
  openApps: Set<AppId>;
  onSelectApp: (app: AppId) => void;
}) {
  const pendingCount = useSimStore((s) => s.pendingResponseIds.size);
  // Docs icon hops while its launch animation is in flight (see docsStore).
  const docsLaunching = useDocsStore((s) => s.launching);

  return (
    <div className="flex h-16 shrink-0 items-center justify-center border-t-2 border-ink bg-bg-taskbar px-3">
      {/* Dock: centered row of app icons, macOS-style. A small dot marks
          which apps are currently open, matching that convention. */}
      <div className="flex items-end gap-2.5">
        {APPS.map((app) => (
          <button
            key={app.id}
            disabled={!app.enabled}
            onClick={() => app.enabled && onSelectApp(app.id)}
            className={`group relative flex flex-col items-center gap-1 transition-transform ${
              app.enabled ? "cursor-pointer hover:-translate-y-1.5" : "cursor-not-allowed opacity-40"
            }`}
            title={app.enabled ? app.label : `${app.label}, coming in a later phase`}
          >
            <div className={`relative ${app.id === "docs" && docsLaunching ? "animate-dock-bounce" : ""}`}>
              <AppIcon id={app.id} sizeClassName="h-9 w-9" />
              {app.id === "chattr" && pendingCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center border-2 border-ink bg-accent-danger px-1 text-caption leading-none text-white">
                  {pendingCount}
                </span>
              )}
            </div>
            <div className={`h-1 w-1 rounded-none ${openApps.has(app.id) ? "bg-ink-soft" : "bg-transparent"}`} />
            <span className="pointer-events-none absolute -top-7 hidden whitespace-nowrap border-2 border-ink bg-bg-window px-1.5 py-0.5 text-caption font-pixel text-ink group-hover:block">
              {app.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
