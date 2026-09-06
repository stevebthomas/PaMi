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
 * app dock.
 *
 * Presentational core: the full app list, order, icons and badge styling,
 * driven entirely by props so the dock can be rendered without a live
 * session. `Taskbar` below is the store-connected wrapper Desktop uses. */
export function TaskbarView({
  openApps,
  onSelectApp,
  chattrBadgeCount = 0,
  docsLaunching = false,
}: {
  openApps: ReadonlySet<AppId>;
  onSelectApp: (app: AppId) => void;
  /** Unread count on the Chattr tile; hidden at 0. */
  chattrBadgeCount?: number;
  /** Plays the Docs tile's launch hop. */
  docsLaunching?: boolean;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-center border-t border-border-hairline bg-surface px-3">
      {/* Dock: centered row of app icons, macOS-style. A small dot marks
          which apps are currently open, matching that convention. */}
      <div className="flex items-end gap-1.5">
        {APPS.map((app) => {
          const isOpen = openApps.has(app.id);
          return (
            <button
              key={app.id}
              disabled={!app.enabled}
              onClick={() => app.enabled && onSelectApp(app.id)}
              className={`group relative flex flex-col items-center gap-1 ${
                app.enabled ? "cursor-pointer" : "cursor-not-allowed opacity-40"
              }`}
              title={app.enabled ? app.label : `${app.label}, coming in a later phase`}
            >
              <div
                className={`relative flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                  app.id === "docs" && docsLaunching ? "animate-dock-bounce" : ""
                } ${
                  isOpen
                    ? "border border-border-hairline bg-surface text-text-primary"
                    : "text-text-secondary group-hover:bg-muted"
                }`}
              >
                <AppIcon id={app.id} sizeClassName="h-5 w-5" />
                {app.id === "chattr" && chattrBadgeCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-green px-1 text-caption leading-none tabular-nums text-white">
                    {chattrBadgeCount}
                  </span>
                )}
              </div>
              <div className={`h-1 w-1 rounded-full ${isOpen ? "bg-accent-green" : "bg-transparent"}`} />
              <span className="pointer-events-none absolute -top-7 hidden whitespace-nowrap rounded-md border border-border-hairline bg-surface px-1.5 py-0.5 text-caption text-text-primary shadow-md group-hover:block">
                {app.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The dock as the running sim uses it: same markup as TaskbarView, with the
 * Chattr unread count and the Docs launch hop read from their stores. */
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
    <TaskbarView
      openApps={openApps}
      onSelectApp={onSelectApp}
      chattrBadgeCount={pendingCount}
      docsLaunching={docsLaunching}
    />
  );
}
