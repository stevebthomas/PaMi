import type { AppId } from "../desktop/Desktop";

/** 8x8 pixel-art glyph per app, on that app's own accent color — one icon
 * definition shared by the dock (Taskbar) and every window's title bar, so
 * an app has exactly one visual identity used in both places. Legend: '.'
 * transparent, 'F' foreground glyph, 'L' a second, darker tone for detail
 * (Notes' ruled lines). */
interface IconDef {
  bg: string;
  fg: string;
  line?: string;
  grid: string[];
}

const ICONS: Record<AppId, IconDef> = {
  chattr: {
    bg: "#6c63ff",
    fg: "#ffffff",
    grid: ["........", ".FFFFFF.", "F......F", "F......F", "F......F", ".FFFF...", "..FF....", "........"],
  },
  pulse: {
    bg: "#34c3a3",
    fg: "#ffffff",
    grid: ["........", "........", "..F.....", "..F.....", ".F.F....", "F...F...", "......F.", "........"],
  },
  taskflow: {
    bg: "#f2a541",
    fg: "#ffffff",
    grid: ["........", ".F.F.F..", ".F.F.F..", ".F.F....", ".F......", "........", "........", "........"],
  },
  notes: {
    bg: "#e8b23f",
    fg: "#ffffff",
    line: "#8a5a1f",
    grid: ["........", ".FFFFFF.", ".FLLLLF.", ".F....F.", ".FLLLLF.", ".F....F.", ".FFFFFF.", "........"],
  },
  askClaude: {
    bg: "#4f9dd8",
    fg: "#ffffff",
    grid: ["........", "..FFF...", ".F...F..", "....F...", "...F....", "........", "...F....", "........"],
  },
  reviews: {
    bg: "#5fae6f",
    fg: "#ffffff",
    grid: ["...F....", "...F....", "F..F..F.", ".F.F.F..", "..FFF...", ".F...F..", "F.....F.", "........"],
  },
  office: {
    bg: "#b8794f",
    fg: "#ffffff",
    line: "#7a4d2f",
    grid: ["........", ".FFFFFF.", ".FLFLFF.", ".FFFFFF.", ".FLFLFF.", ".FFFFFF.", ".FFLLFF.", "........"],
  },
};

export function AppIcon({ id, sizeClassName = "h-6 w-6" }: { id: AppId; sizeClassName?: string }) {
  const icon = ICONS[id];
  return (
    <div className={`pixel-border shrink-0 overflow-hidden ${sizeClassName}`} style={{ backgroundColor: icon.bg }}>
      <svg viewBox="0 0 8 8" shapeRendering="crispEdges" className="h-full w-full">
        {icon.grid.map((row, y) =>
          row.split("").map((ch, x) => {
            const fill = ch === "F" ? icon.fg : ch === "L" ? icon.line : null;
            if (!fill) return null;
            return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />;
          })
        )}
      </svg>
    </div>
  );
}
