import {
  Activity,
  Building2,
  CircleHelp,
  FileText,
  MessageSquare,
  SquareKanban,
  StickyNote,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { AppId } from "../desktop/Desktop";

/** One lucide line-icon per app, shared by the dock (Taskbar) and every
 * window's title bar so an app keeps a single visual identity in both places.
 * The icon inherits its color from the parent (currentColor), letting each
 * context set rest/active tone; callers own the surrounding tile. */
const ICONS: Record<AppId, LucideIcon> = {
  chattr: MessageSquare,
  pulse: Activity,
  taskflow: SquareKanban,
  askClaude: CircleHelp,
  reviews: Star,
  notes: StickyNote,
  office: Building2,
  docs: FileText,
};

export function AppIcon({ id, sizeClassName = "h-6 w-6" }: { id: AppId; sizeClassName?: string }) {
  const Icon = ICONS[id];
  return <Icon aria-hidden="true" strokeWidth={2} className={`shrink-0 ${sizeClassName}`} />;
}
