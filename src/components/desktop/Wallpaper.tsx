import { getSunPosition, WALLPAPER_VIEWBOX } from "@/lib/sim/timeOfDay";

/** A blocky pixel-art sun (a stepped-circle disc plus 8 rays), built from
 * plain rects so it stays crisp at any scale: matches the hard-edged style
 * everywhere else in the UI rather than a smooth SVG circle. */
function SunSprite({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  const core = [
    { x: cx - 4, y: cy - 11, w: 8, h: 4 },
    { x: cx - 8, y: cy - 7, w: 16, h: 3 },
    { x: cx - 11, y: cy - 4, w: 22, h: 8 },
    { x: cx - 8, y: cy + 4, w: 16, h: 3 },
    { x: cx - 4, y: cy + 7, w: 8, h: 4 },
  ];
  const rays = [
    { x: cx - 1.5, y: cy - 17, w: 3, h: 5 }, // N
    { x: cx - 1.5, y: cy + 12, w: 3, h: 5 }, // S
    { x: cx + 12, y: cy - 1.5, w: 5, h: 3 }, // E
    { x: cx - 17, y: cy - 1.5, w: 5, h: 3 }, // W
    { x: cx + 7, y: cy - 11, w: 3, h: 3 }, // NE
    { x: cx - 10, y: cy - 11, w: 3, h: 3 }, // NW
    { x: cx + 7, y: cy + 8, w: 3, h: 3 }, // SE
    { x: cx - 10, y: cy + 8, w: 3, h: 3 }, // SW
  ];
  return (
    <>
      {rays.map((r, i) => (
        <rect key={`ray-${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={color} opacity={0.7} />
      ))}
      {core.map((r, i) => (
        <rect key={`core-${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={color} />
      ))}
    </>
  );
}

/** The full desktop scene: sunset-band sky, the sun, and a two-layer
 * mountain silhouette, as ONE inline SVG rather than a CSS background
 * image. That's what lets the sun be geometrically locked to the mountain
 * polygons: it's drawn in the exact same viewBox coordinate space, behind
 * both mountain layers in paint order, so it's automatically occluded
 * wherever a polygon's fill covers its position and automatically visible
 * wherever it doesn't: "hidden behind the mountains" and "emerges through
 * this gap" both fall out of that for free, at any window size, instead of
 * needing to be hand-synced between a CSS background and a separately
 * percentage-positioned element. preserveAspectRatio="xMidYMax slice"
 * reproduces the old background-size:cover + background-position:center
 * bottom behavior: crop to fill, anchored to the bottom edge. */
export function Wallpaper({ dayProgress }: { dayProgress: number }) {
  const sun = getSunPosition(dayProgress);

  return (
    <svg
      viewBox={`0 0 ${WALLPAPER_VIEWBOX.width} ${WALLPAPER_VIEWBOX.height}`}
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
    >
      <rect x="0" y="0" width="320" height="26" fill="#1f1147" />
      <rect x="0" y="26" width="320" height="26" fill="#3a2172" />
      <rect x="0" y="52" width="320" height="26" fill="#6b2f8a" />
      <rect x="0" y="78" width="320" height="26" fill="#a83a7e" />
      <rect x="0" y="104" width="320" height="26" fill="#dd5a72" />
      <rect x="0" y="130" width="320" height="18" fill="#f4914a" />

      <SunSprite cx={sun.x} cy={sun.y} color={sun.color} />

      <polygon
        points="0,148 20,140 40,144 60,132 80,138 100,126 120,134 140,122 160,130 180,120 200,128 220,118 240,126 260,116 280,124 300,114 320,120 320,180 0,180"
        fill="#4a2166"
      />
      <polygon
        points="0,164 24,156 48,160 72,150 96,156 120,146 144,154 168,144 192,150 216,140 240,148 264,138 288,146 320,138 320,180 0,180"
        fill="#2d1450"
      />
    </svg>
  );
}
