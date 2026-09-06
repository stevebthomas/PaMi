import { useSimStore } from "@/store/simStore";
import { AGENT_NAMES, type AgentId } from "@/lib/sim/types";

/** 8x8 pixel-grid sprites, hand-authored per persona so each has real visual
 * identity instead of a generic colored initial. Legend: '.' transparent,
 * 'H' hair, 'S' skin, 'E' eye (ink), 'A' accent (shirt/collar, matches that
 * person's existing brand color so this stays visually tied to their
 * channel/DM accent elsewhere in the app), 'T' a second accent detail
 * (Derek's tie knot; Theo's headphone band/cups). The six roleplay NPC
 * personas get a fixed sprite keyed by AgentId; system/assistant keep the
 * plain letter-square treatment, since they aren't characters being
 * portrayed. The player ALSO gets a sprite (see PLAYER_SPRITES below), but
 * theirs is chosen at onboarding rather than fixed, so it's resolved
 * separately from this per-agent table.
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
  theo: {
    // Same hair/skin as his Office desk sprite (worldCanon ENGINEERS), so his
    // Chattr portrait reads as the same person; accent matches his
    // established #6a8caf (also FALLBACK_COLORS and his Office desk sprite).
    hair: "#c9a227",
    skin: "#f2d3a2",
    accent: "#6a8caf",
    // Junior-engineer look: short crop (no full hair row) plus headphones,
    // rendered as a band/cups in 'T' at the ear line, a darker step down
    // from his accent.
    tie: "#3f5068",
    grid: ["..HHHH..", "TH....HT", "TSSSSSST", "SSSSSSSS", "SSESSESS", "SSSSSSSS", ".AAAAAA.", "AAAAAAAA"],
  },
};

/** The five selectable player avatars (see WelcomeScreen's "Pick your
 * avatar" control). Ordered array with stable ids, so a persisted
 * stateBag.playerAvatarId always resolves to the same option even if this
 * array is reordered later. Each carries its own bgClassName (mirroring what
 * FALLBACK_COLORS does per-NPC below) since these aren't keyed by AgentId and
 * so can't share that table; it's shown behind the sprite's transparent '.'
 * pixels and matches that option's accent, same as every NPC's background
 * matches theirs.
 *
 * Design intent: five distinct silhouettes (hair shape) x five distinct
 * palettes (hair/skin/accent), none of which collide with an NPC's accent
 * color. player-1 keeps the player's original teal (#34c3a3, still
 * FALLBACK_COLORS.player below) as the default/pre-selected option, so
 * "Start your day" never blocks on making a choice and the visual identity
 * established before this feature stays the default.
 */
export interface PlayerSpriteOption {
  id: string;
  bgClassName: string;
  sprite: Sprite;
}

export const PLAYER_SPRITES: PlayerSpriteOption[] = [
  {
    id: "player-1",
    bgClassName: "bg-[#34c3a3]",
    sprite: {
      hair: "#1c1c1c",
      skin: "#e8c39e",
      accent: "#34c3a3",
      grid: [".HHHHHH.", "HHHHHHHH", "HSSSSSSH", "SSSSSSSS", "SSESSESS", "SSSSSSSS", ".AAAAAA.", "AAAAAAAA"],
    },
  },
  {
    id: "player-2",
    bgClassName: "bg-[#ff8a5b]",
    sprite: {
      // Short quiff with a side part, distinct silhouette from every NPC's
      // short-hair variant (derek/theo).
      hair: "#a4462a",
      skin: "#c98a5c",
      accent: "#ff8a5b",
      grid: ["..HHHHH.", ".HH...H.", ".SSSSSS.", "SSSSSSSS", "SSESSESS", "SSSSSSSS", ".AAAAAA.", "AAAAAAAA"],
    },
  },
  {
    id: "player-3",
    bgClassName: "bg-[#b34fd6]",
    sprite: {
      // Long hair with a headband (rendered via 'T'), fair skin.
      hair: "#e8d48a",
      skin: "#f0c9a0",
      accent: "#b34fd6",
      tie: "#7a2fb0",
      grid: [".HHHHHH.", "HHHHHHHH", "HSSSSSSH", "TSSSSSST", "SSESSESS", "SSSSSSSS", ".AAAAAA.", "AAAAAAAA"],
    },
  },
  {
    id: "player-4",
    bgClassName: "bg-[#d4a017]",
    sprite: {
      // Left-side hair tuft, deep brown skin.
      hair: "#4a3222",
      skin: "#8a5a3c",
      accent: "#d4a017",
      grid: [".HHHHHH.", "HHHHHHHH", "HSSSSSSS", "SSSSSSSS", "SSESSESS", "SSSSSSSS", ".AAAAAA.", "AAAAAAAA"],
    },
  },
  {
    id: "player-5",
    bgClassName: "bg-[#4f8f3f]",
    sprite: {
      // Top-knot: the most distinct silhouette of the five, hair concentrated
      // at top-center only.
      hair: "#b0b0b0",
      skin: "#d8a878",
      accent: "#4f8f3f",
      grid: ["...HH...", "..HHHH..", ".SSSSSS.", "SSSSSSSS", "SSESSESS", "SSSSSSSS", ".AAAAAA.", "AAAAAAAA"],
    },
  },
];

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

/** Renders a single sprite BY VALUE, independent of any AgentId lookup. Used
 * both by PixelAvatar itself and directly by WelcomeScreen's avatar picker,
 * which needs to preview each PLAYER_SPRITES option on its own merits (not
 * through the store-backed agentId === "player" resolution path, since none
 * of the unselected options are "the player" yet). */
export function SpriteIcon({
  sprite,
  bgClassName,
  sizeClassName = "h-8 w-8",
  label,
}: {
  sprite: Sprite;
  bgClassName: string;
  sizeClassName?: string;
  label?: string;
}) {
  return (
    <div className={`shrink-0 overflow-hidden rounded-full border border-border-hairline ${sizeClassName} ${bgClassName}`}>
      <svg viewBox="0 0 8 8" shapeRendering="crispEdges" className="h-full w-full" aria-label={label}>
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

/** Renders a persona's pixel portrait, or the plain letter-square fallback
 * for anyone without a sprite (system, or a player with no chosen avatar).
 *
 * Presentational core: resolves entirely from its props and reads no store,
 * so it can be rendered outside a live session (the player's sprite id is
 * supplied explicitly via `playerSpriteId`). `PixelAvatar` below is the
 * store-connected wrapper every in-sim call site uses.
 */
export function PixelAvatarView({
  agentId,
  sizeClassName = "h-8 w-8",
  playerSpriteId = null,
}: {
  agentId: AgentId;
  sizeClassName?: string;
  /** Which PLAYER_SPRITES option to use for `agentId === "player"`. Null (or
   * an id with no match) falls back to the plain letter square. */
  playerSpriteId?: string | null;
}) {
  const playerOption = agentId === "player" ? PLAYER_SPRITES.find((p) => p.id === playerSpriteId) : undefined;

  const sprite = agentId === "player" ? playerOption?.sprite : SPRITES[agentId];
  const bgClassName = playerOption?.bgClassName ?? FALLBACK_COLORS[agentId];

  if (!sprite) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full border border-border-hairline text-label font-sans font-medium text-white ${sizeClassName} ${bgClassName}`}
      >
        {AGENT_NAMES[agentId].slice(0, 1)}
      </div>
    );
  }

  return <SpriteIcon sprite={sprite} bgClassName={bgClassName} sizeClassName={sizeClassName} label={AGENT_NAMES[agentId]} />;
}

/** Store-connected avatar: the component every in-sim surface renders.
 *
 * Resolution for the player: PixelAvatar has ~15 call sites across Chattr,
 * the standup call, Ask Claude, and HR orientation. Rather than thread a new
 * prop through all of them, PixelAvatar reads the player's chosen sprite id
 * straight from stateBag.playerAvatarId (set once at onboarding, see
 * WelcomeScreen + setPlayerAvatarId) for the agentId === "player" case only —
 * every existing call site then shows the chosen sprite automatically with
 * no changes on their end, and the component's public API (agentId,
 * sizeClassName) is unchanged for every other caller. The store selector
 * always runs (hooks can't be called conditionally); its result is simply
 * unused when agentId !== "player". A session with no selection yet
 * (playerAvatarId still null — any session persisted before this feature
 * shipped) falls through to the same letter-square as before: zero visual
 * change for those sessions.
 */
export function PixelAvatar({ agentId, sizeClassName = "h-8 w-8" }: { agentId: AgentId; sizeClassName?: string }) {
  const playerAvatarId = useSimStore((s) => s.stateBag.playerAvatarId);
  return <PixelAvatarView agentId={agentId} sizeClassName={sizeClassName} playerSpriteId={playerAvatarId} />;
}

/** Desk portrait: the same 8x8 sprite idiom as above, but built from a plain
 * hair/skin/accent triple instead of an AgentId lookup, so a face can be drawn
 * for someone with no SPRITES entry of their own. This is what the Office
 * floor's desk cards use (their palettes live in worldCanon's ENGINEERS). */
export function GenericAvatar({ hair, skin, accent }: { hair: string; skin: string; accent: string }) {
  const grid = [".HHHHHH.", "HHHHHHHH", ".SSSSSS.", "SSSSSSSS", "SSESSESS", "SSSSSSSS", ".AAAAAA.", "AAAAAAAA"];
  const colorFor = (ch: string) => {
    if (ch === "H") return hair;
    if (ch === "S") return skin;
    if (ch === "E") return "#241f33";
    if (ch === "A") return accent;
    return null;
  };
  return (
    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-border-hairline bg-surface">
      <svg viewBox="0 0 8 8" shapeRendering="crispEdges" className="h-full w-full">
        {grid.map((row, y) =>
          row.split("").map((ch, x) => {
            const fill = colorFor(ch);
            if (!fill) return null;
            return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />;
          })
        )}
      </svg>
    </div>
  );
}
