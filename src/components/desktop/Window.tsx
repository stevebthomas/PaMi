import { X } from "lucide-react";
import type { PointerEventHandler, ReactNode } from "react";

export function Window({
  title,
  icon,
  headerRight,
  onTitleBarPointerDown,
  onTitleBarPointerMove,
  onTitleBarPointerUp,
  onClose,
  children,
}: {
  title: string;
  icon?: ReactNode;
  headerRight?: ReactNode;
  onTitleBarPointerDown?: PointerEventHandler<HTMLDivElement>;
  onTitleBarPointerMove?: PointerEventHandler<HTMLDivElement>;
  onTitleBarPointerUp?: PointerEventHandler<HTMLDivElement>;
  onClose?: () => void;
  children: ReactNode;
}) {
  const draggable = Boolean(onTitleBarPointerDown);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border-hairline bg-surface shadow-lg">
      <div
        className={`flex items-center justify-between border-b border-border-hairline px-3 py-2 ${
          draggable ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""
        }`}
        onPointerDown={onTitleBarPointerDown}
        onPointerMove={onTitleBarPointerMove}
        onPointerUp={onTitleBarPointerUp}
      >
        <div className="flex min-w-0 items-center gap-2 text-text-secondary">
          {icon}
          <span className="truncate text-label font-semibold text-text-primary">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {headerRight}
          {onClose && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Close ${title}`}
              className="-mr-1 flex h-6 w-6 items-center justify-center rounded-md text-text-secondary hover:bg-muted hover:text-text-primary"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
