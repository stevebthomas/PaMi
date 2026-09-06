"use client";

import { useCallback, useRef, type PointerEvent, type ReactNode, type RefObject } from "react";
import { Window } from "./Window";
import { isDocWindowId, useWindowStore, type WindowId, type WindowSizeClamp } from "@/store/windowStore";
import { AppIcon } from "@/components/shared/AppIcon";

/** How much of the title bar must always stay reachable on screen. */
const MIN_VISIBLE_X = 120;
const TITLE_BAR_HEIGHT = 40;
/** Breathing room kept between a resized window's far edge and the desk edge,
 * matching the 16px inset openWindow already centers windows within. */
const RESIZE_MARGIN = 16;

/** Placed rectangle a desktop window is drawn at. Structurally the geometry
 * half of windowStore's WindowInstance, without its `id`. */
export type WindowFrame = { x: number; y: number; width: number; height: number; zIndex: number };

/**
 * The window chrome, PRESENTATIONAL. Everything DesktopWindow used to do — the
 * absolutely-positioned frame, the title-bar drag with its on-desk clamping,
 * the bottom-right resize grip, focus-on-mousedown — but reading its rectangle
 * from a prop and reporting every change through callbacks instead of reaching
 * into the window store.
 *
 * The connected `DesktopWindow` below is the only in-app caller and is
 * unchanged in name, props and behavior: it binds these callbacks straight to
 * the store actions it always called. The split exists so the ad-mode filming
 * route can render the SHIPPING window chrome (drag included) against its own
 * demo-local, store-free window state.
 */
export function DesktopWindowView({
  frame,
  title,
  icon,
  headerRight,
  containerRef,
  minSize,
  onFocus,
  onMove,
  onResize,
  onClose,
  children,
}: {
  frame: WindowFrame;
  title: string;
  icon?: ReactNode;
  headerRight?: ReactNode;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Per-window resize floor; the desk bounds supply the ceiling. */
  minSize: { width: number; height: number };
  /** Raise this window (title-bar press, resize press, any mousedown inside). */
  onFocus: () => void;
  /** Dragged to a new, already on-desk-clamped top-left. */
  onMove: (x: number, y: number) => void;
  /** Raw dragged size plus the bounds it must be clamped into. The clamp itself
   * is the callee's (windowStore.resizeWindow / clampWindowSize), exactly as
   * before. */
  onResize: (width: number, height: number, clamp: WindowSizeClamp) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; winX: number; winY: number } | null>(null);
  const resizeOrigin = useRef<{ pointerX: number; pointerY: number; winW: number; winH: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      onFocus();
      dragOrigin.current = { pointerX: e.clientX, pointerY: e.clientY, winX: frame.x, winY: frame.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [frame.x, frame.y, onFocus]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const origin = dragOrigin.current;
      if (!origin) return;

      const bounds = containerRef.current;
      const boundsW = bounds?.clientWidth ?? window.innerWidth;
      const boundsH = bounds?.clientHeight ?? window.innerHeight;

      const dx = e.clientX - origin.pointerX;
      const dy = e.clientY - origin.pointerY;

      const minX = MIN_VISIBLE_X - frame.width;
      const maxX = boundsW - MIN_VISIBLE_X;
      const minY = 0;
      const maxY = Math.max(minY, boundsH - TITLE_BAR_HEIGHT);

      const nextX = Math.min(Math.max(origin.winX + dx, minX), maxX);
      const nextY = Math.min(Math.max(origin.winY + dy, minY), maxY);

      onMove(nextX, nextY);
    },
    [frame.width, onMove, containerRef]
  );

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    dragOrigin.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  // Resize handle: same pointer-capture pattern as the title-bar drag above,
  // just growing width/height from the bottom-right corner instead of moving x/y.
  const handleResizeDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onFocus();
      resizeOrigin.current = { pointerX: e.clientX, pointerY: e.clientY, winW: frame.width, winH: frame.height };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [frame.width, frame.height, onFocus]
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

      onResize(origin.winW + dx, origin.winH + dy, {
        minWidth: minSize.width,
        minHeight: minSize.height,
        maxWidth: boundsW - RESIZE_MARGIN,
        maxHeight: boundsH - RESIZE_MARGIN,
      });
    },
    [onResize, containerRef, minSize.width, minSize.height]
  );

  const handleResizeUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    resizeOrigin.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      className="absolute"
      style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height, zIndex: frame.zIndex }}
      onMouseDown={onFocus}
    >
      <Window
        title={title}
        icon={icon}
        headerRight={headerRight}
        onTitleBarPointerDown={handlePointerDown}
        onTitleBarPointerMove={handlePointerMove}
        onTitleBarPointerUp={handlePointerUp}
        onClose={onClose}
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
        className="absolute bottom-0 right-0 z-10 flex h-4 w-4 cursor-nwse-resize touch-none items-end justify-end p-0.5 text-text-secondary"
      >
        <svg viewBox="0 0 8 8" className="h-2.5 w-2.5" aria-hidden="true">
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

export function DesktopWindow({
  id,
  title,
  icon,
  headerRight,
  containerRef,
  minSize,
  children,
}: {
  id: WindowId;
  /** Title-bar icon override. App windows omit it and fall back to their
   * AppIcon; document windows pass an explicit icon (FileText), since their id
   * is a `doc:${docId}` key with no AppIcon of its own. */
  title: string;
  icon?: ReactNode;
  headerRight?: ReactNode;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Per-window resize floor (Desktop's APP_MIN_SIZE, or DOC_WINDOW_SIZE for
   * doc windows); the desk bounds supply the ceiling. Threaded as a prop so the
   * store stays free of Desktop's size tables (mirrors how containerRef, not
   * the store, owns the drag bounds). */
  minSize: { width: number; height: number };
  children: ReactNode;
}) {
  const win = useWindowStore((s) => s.windows[id]);
  const bringToFront = useWindowStore((s) => s.bringToFront);
  const moveWindow = useWindowStore((s) => s.moveWindow);
  const resizeWindow = useWindowStore((s) => s.resizeWindow);
  const closeWindow = useWindowStore((s) => s.closeWindow);

  const handleFocus = useCallback(() => bringToFront(id), [bringToFront, id]);
  const handleMove = useCallback((x: number, y: number) => moveWindow(id, x, y), [moveWindow, id]);
  const handleResize = useCallback(
    (width: number, height: number, clamp: WindowSizeClamp) => resizeWindow(id, width, height, clamp),
    [resizeWindow, id]
  );
  const handleClose = useCallback(() => closeWindow(id), [closeWindow, id]);

  if (!win) return null;

  return (
    <DesktopWindowView
      frame={win}
      title={title}
      icon={icon ?? (isDocWindowId(id) ? undefined : <AppIcon id={id} sizeClassName="h-4 w-4" />)}
      headerRight={headerRight}
      containerRef={containerRef}
      minSize={minSize}
      onFocus={handleFocus}
      onMove={handleMove}
      onResize={handleResize}
      onClose={handleClose}
    >
      {children}
    </DesktopWindowView>
  );
}
