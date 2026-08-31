/** The desktop ground. The old pixel sunset/mountain scene is retired: the
 * background is now the flat warm canvas token (which resolves correctly in
 * dark mode). Kept as a mounted component with the same API so Desktop's
 * layering and the ambient time-of-day tint layered above it are unchanged;
 * `dayProgress` is intentionally no longer read here now that the scene is
 * gone. A single very quiet radial wash adds the faintest depth without any
 * scene, texture, or pixels. */
// dayProgress is kept in the API (Desktop still passes it, and the ambient
// time-of-day tint layered above continues to use it) but is intentionally
// no longer read here now that the scene is gone.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Wallpaper({ dayProgress }: { dayProgress: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 bg-canvas"
      style={{
        backgroundImage:
          "radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--text-primary) 3%, transparent), transparent 60%)",
      }}
    />
  );
}
