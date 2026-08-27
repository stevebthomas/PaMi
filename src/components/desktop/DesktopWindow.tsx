"use client";

import { useCallback, useRef, type PointerEvent, type ReactNode, type RefObject } from "react";
import { Window } from "./Window";
import { useWindowStore } from "@/store/windowStore";
import type { AppId } from "./Desktop";
import { AppIcon } from "@/components/shared/AppIcon";

/** How much of the title bar must always stay reachable on screen. */
const MIN_VISIBLE_X = 120;
const TITLE_BAR_HEIGHT = 40;

export function DesktopWindow({
  id,
  title,
  accentClassName,
  headerRight,
  containerRef,
  children,
}: {
  id: AppId;
  title: string;
  accentClassName: string;
  headerRight?: ReactNode;
  containerRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const win = useWindowStore((s) => s.windows[id]);
  const bringToFront = useWindowStore((s) => s.bringToFront);
  const moveWindow = useWindowStore((s) => s.moveWindow);
  const closeWindow = useWindowStore((s) => s.closeWindow);

  const dragOrigin = useRef<{ pointerX: number; pointerY: number; winX: number; winY: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!win) return;
      bringToFront(id);
      dragOrigin.current = { pointerX: e.clientX, pointerY: e.clientY, winX: win.x, winY: win.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [win, id, bringToFront]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const origin = dragOrigin.current;
      if (!origin || !win) return;

      const bounds = containerRef.current;
      const boundsW = bounds?.clientWidth ?? window.innerWidth;
      const boundsH = bounds?.clientHeight ?? window.innerHeight;

      const dx = e.clientX - origin.pointerX;
      const dy = e.clientY - origin.pointerY;

      const minX = MIN_VISIBLE_X - win.width;
      const maxX = boundsW - MIN_VISIBLE_X;
      const minY = 0;
      const maxY = Math.max(minY, boundsH - TITLE_BAR_HEIGHT);

      const nextX = Math.min(Math.max(origin.winX + dx, minX), maxX);
      const nextY = Math.min(Math.max(origin.winY + dy, minY), maxY);

      moveWindow(id, nextX, nextY);
    },
    [win, id, moveWindow, containerRef]
  );

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    dragOrigin.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  if (!win) return null;

  return (
    <div
      className="absolute"
      style={{ left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.zIndex }}
      onMouseDown={() => bringToFront(id)}
    >
      <Window
        title={title}
        icon={<AppIcon id={id} sizeClassName="h-5 w-5" />}
        accentClassName={accentClassName}
        headerRight={headerRight}
        onTitleBarPointerDown={handlePointerDown}
        onTitleBarPointerMove={handlePointerMove}
        onTitleBarPointerUp={handlePointerUp}
        onClose={() => closeWindow(id)}
      >
        {children}
      </Window>
    </div>
  );
}
