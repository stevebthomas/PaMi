import { AGENT_NAMES, type AgentId } from "@/lib/sim/types";

/** 8x8 pixel-grid sprites, hand-authored per persona so each has real visual
 * identity instead of a generic colored initial. Legend: '.' transparent,
 * 'H' hair, 'S' skin, 'E' eye (ink), 'A' accent (shirt/collar, matches that
 * person's existing brand color so this stays visually tied to their
 * channel/DM accent elsewhere in the app), 'T' a second accent detail
 * (Derek's tie knot). Only the five roleplay personas get a sprite:
 * system/player/assistant intentionally keep the plain letter-square
 * treatment, since they aren't characters being portrayed.
 */
interface Sprite {
  hair: string;
  skin: string;
  accent: string;
  tie?: string;
  grid: string[];
}

const SPRITES: Partial<Record<AgentId, Sprite>> = {
  raj: {
    hair: "#241f33",
    skin: "#d8a878",
    accent: "#6c63ff",
    grid: [".HHHHHH.", "HHHHHHHH", ".SSSSSS.", "SSSSSSSS", "SSESSESS", "SSSSSSSS", ".AAAAAA.", "AAAAAAAA"],
  },
  priya: {
    hair: "#2b2320",
    skin: "#c98a5c",
    accent: "#f2a541",
    grid: ["..HHHH..", ".HHHHHH.", "ASSSSSSA", "SSSSSSSS", "SSESSESS", "SSSSSSSS", ".AAAAAA.", "AAAAAAAA"],
  },
  derek: {
    hair: "#9a9a9a",
    skin: "#e8c39e",
    accent: "#e0556f",
    tie: "#a83a4a",
    grid: ["..HHHH..", ".H....H.", ".SSSSSS.", "SSSSSSSS", "SSESSESS", "SSSSSSSS", ".AAAAAA.", "AAATAAAA"],
  },
  sam: {
    hair: "#8a5a34",
    skin: "#f0c9a0",
    accent: "#a06cd5",
    grid: [".HHHHHH.", "HHHHHHHH", "HSSSSSSH", "SSSSSSSS", "SSESSESS", "SSSSSSSS", ".AAAAAA.", "AAAAAAAA"],
  },
  maya: {
    hair: "#3a2418",
    skin: "#b97a52",
    accent: "#e87fb0",
    grid: [".HHHHHH.", "HHHHHHHH", ".SSSSSSH", "SSSSSSSS", "SSESSESS", "SSSSSSSS", ".AAAAAA.", "AAAAAAAA"],
  },
};

const FALLBACK_COLORS: Record<AgentId, string> = {
  raj: "bg-[#6c63ff]",
  priya: "bg-[#f2a541]",
  derek: "bg-[#e0556f]",
  sam: "bg-[#a06cd5]",
  maya: "bg-[#e87fb0]",
  theo: "bg-[#6a8caf]",
  // Jordan/Chen keep the same accents their Office sprites use, so their
  // Chattr letter-square reads as the same person as their desk card.
  jordan: "bg-[#4f9dd8]",
  chen: "bg-[#e0556f]",
  // Marcus keeps the same accent his Office desk sprite uses (worldCanon
  // ENGINEERS), so his Chattr letter-square reads as the same person.
  marcus: "bg-[#3f8f6f]",
  system: "bg-[#5b5470]",
  player: "bg-[#34c3a3]",
};

function colorFor(sprite: Sprite, ch: string): string | null {
  switch (ch) {
    case "H":
      return sprite.hair;
    case "S":
      return sprite.skin;
    case "E":
      return "#241f33";
    case "A":
      return sprite.accent;
    case "T":
      return sprite.tie ?? sprite.accent;
    default:
      return null;
  }
}

/** Renders a persona's pixel portrait, or the plain letter-square fallback
 * for anyone without a sprite (system, player, or any future agent id). */
export function PixelAvatar({ agentId, sizeClassName = "h-8 w-8" }: { agentId: AgentId; sizeClassName?: string }) {
  const sprite = SPRITES[agentId];

  if (!sprite) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full border border-border-hairline text-label font-sans font-medium text-white ${sizeClassName} ${FALLBACK_COLORS[agentId]}`}
      >
        {AGENT_NAMES[agentId].slice(0, 1)}
      </div>
    );
  }

  return (
    <div className={`shrink-0 overflow-hidden rounded-full border border-border-hairline ${sizeClassName} ${FALLBACK_COLORS[agentId]}`}>
      <svg viewBox="0 0 8 8" shapeRendering="crispEdges" className="h-full w-full" aria-label={AGENT_NAMES[agentId]}>
        {sprite.grid.map((row, y) =>
          row.split("").map((ch, x) => {
            const fill = colorFor(sprite, ch);
            if (!fill) return null;
            return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />;
          })
        )}
      </svg>
    </div>
  );
}
