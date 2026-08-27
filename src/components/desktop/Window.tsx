import type { PointerEventHandler, ReactNode } from "react";

export function Window({
  title,
  icon,
  accentClassName,
  headerRight,
  onTitleBarPointerDown,
  onTitleBarPointerMove,
  onTitleBarPointerUp,
  onClose,
  children,
}: {
  title: string;
  icon?: ReactNode;
  accentClassName: string;
  headerRight?: ReactNode;
  onTitleBarPointerDown?: PointerEventHandler<HTMLDivElement>;
  onTitleBarPointerMove?: PointerEventHandler<HTMLDivElement>;
  onTitleBarPointerUp?: PointerEventHandler<HTMLDivElement>;
  onClose?: () => void;
  children: ReactNode;
}) {
  const draggable = Boolean(onTitleBarPointerDown);

  return (
    <div className="pixel-border flex h-full w-full flex-col overflow-hidden bg-bg-window">
      <div
        className={`flex items-center justify-between border-b-2 border-ink px-3 py-2 ${accentClassName} ${
          draggable ? "cursor-grab touch-none select-none active:cursor-grabbing" : ""
        }`}
        onPointerDown={onTitleBarPointerDown}
        onPointerMove={onTitleBarPointerMove}
        onPointerUp={onTitleBarPointerUp}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-pixel text-[10px] text-ink">{title}</span>
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
              className="flex h-4 w-4 items-center justify-center border-2 border-ink bg-bg-window text-[10px] leading-none text-ink hover:bg-accent-danger hover:text-white"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
