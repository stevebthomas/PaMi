"use client";

import { useCallback, useRef, type PointerEvent, type ReactNode, type RefObject } from "react";
import { Window } from "./Window";
import { useWindowStore } from "@/store/windowStore";
import type { AppId } from "./Desktop";
import { AppIcon } from "@/components/shared/AppIcon";

/** How much of the title bar must always stay reachable on screen. */
const MIN_VISIBLE_X = 120;
const TITLE_BAR_HEIGHT = 40;
/** Breathing room kept between a resized window's far edge and the desk edge,
 * matching the 16px inset openWindow already centers windows within. */
const RESIZE_MARGIN = 16;

export function DesktopWindow({
  id,
  title,
  accentClassName,
  headerRight,
  containerRef,
  minSize,
  children,
}: {
  id: AppId;
  title: string;
  accentClassName: string;
  headerRight?: ReactNode;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Per-app resize floor (Desktop's APP_MIN_SIZE); the desk bounds supply the
   * ceiling. Threaded as a prop so the store stays free of Desktop's size
   * tables (mirrors how containerRef, not the store, owns the drag bounds). */
  minSize: { width: number; height: number };
  children: ReactNode;
}) {
  const win = useWindowStore((s) => s.windows[id]);
  const bringToFront = useWindowStore((s) => s.bringToFront);
  const moveWindow = useWindowStore((s) => s.moveWindow);
  const resizeWindow = useWindowStore((s) => s.resizeWindow);
  const closeWindow = useWindowStore((s) => s.closeWindow);

  const dragOrigin = useRef<{ pointerX: number; pointerY: number; winX: number; winY: number } | null>(null);
  const resizeOrigin = useRef<{ pointerX: number; pointerY: number; winW: number; winH: number } | null>(null);

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

  // Resize handle: same pointer-capture pattern as the title-bar drag above,
  // just growing width/height from the bottom-right corner instead of moving x/y.
  const handleResizeDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!win) return;
      e.stopPropagation();
      bringToFront(id);
      resizeOrigin.current = { pointerX: e.clientX, pointerY: e.clientY, winW: win.width, winH: win.height };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [win, id, bringToFront]
  );

  const handleResizeMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const origin = resizeOrigin.current;
      if (!origin) return;

      const bounds = containerRef.current;
      const boundsW = bounds?.clientWidth ?? window.innerWidth;
      const boundsH = bounds?.clientHeight ?? window.innerHeight;

      const dx = e.clientX - origin.pointerX;
      const dy = e.clientY - origin.pointerY;

      resizeWindow(id, origin.winW + dx, origin.winH + dy, {
        minWidth: minSize.width,
        minHeight: minSize.height,
        maxWidth: boundsW - RESIZE_MARGIN,
        maxHeight: boundsH - RESIZE_MARGIN,
      });
    },
    [id, resizeWindow, containerRef, minSize.width, minSize.height]
  );

  const handleResizeUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    resizeOrigin.current = null;
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
      {/* Resize grip: a sibling of Window (not a child), because Window's root
          is overflow-hidden and would clip a handle placed inside it. Sits at
          the outer div's bottom-right corner, above content, with a small hit
          area + touch-none so it never eats window scrolling. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Resize ${title}`}
        onPointerDown={handleResizeDown}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeUp}
        className="absolute bottom-0 right-0 z-10 flex h-4 w-4 cursor-nwse-resize touch-none items-end justify-end p-0.5 text-ink-soft"
      >
        <svg viewBox="0 0 8 8" shapeRendering="crispEdges" className="h-2.5 w-2.5" aria-hidden="true">
          <rect x={6} y={2} width={1} height={1} fill="currentColor" />
          <rect x={4} y={4} width={1} height={1} fill="currentColor" />
          <rect x={6} y={4} width={1} height={1} fill="currentColor" />
          <rect x={2} y={6} width={1} height={1} fill="currentColor" />
          <rect x={4} y={6} width={1} height={1} fill="currentColor" />
          <rect x={6} y={6} width={1} height={1} fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}
