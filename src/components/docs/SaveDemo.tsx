"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Check } from "lucide-react";

/**
 * Small interactive "save for later" demo embedded INSIDE a mockup doc (see
 * simDocs.ts `demo` field and DocWindow's `{{demo}}` marker). One component, two
 * variants:
 *
 *   - "saved-animation": tapping Save plays a real confirmation moment. A
 *     "Saved!" chip fades in (~150ms), holds (~800ms), fades out (~300ms) via
 *     the `save-demo-toast` CSS animation. Under prefers-reduced-motion the
 *     fades drop to instant show/hide but the HOLD is retained (see globals.css)
 *     because the confirmation moment is the whole point of this mockup.
 *   - "silent-instant": tapping Save toggles the saved state with deliberately
 *     zero animation or transition.
 *
 * Local state only. Nothing is persisted and no store is touched — this is a
 * throwaway product mock the player pokes at to feel the difference between the
 * two designs Maya is proposing. The button toggles saved/unsaved so the
 * confirmation can be replayed.
 */
export function SaveDemo({ variant }: { variant: "saved-animation" | "silent-instant" }) {
  const [saved, setSaved] = useState(false);
  // Bumped on every save so the toast element remounts and the CSS animation
  // replays from the top; `toastVisible` unmounts it once the animation ends.
  const [toastNonce, setToastNonce] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);

  function handleToggle() {
    const next = !saved;
    setSaved(next);
    // Only the animation variant shows the confirmation chip, and only when
    // going unsaved -> saved (unsaving is silent in both variants).
    if (variant === "saved-animation" && next) {
      setToastNonce((n) => n + 1);
      setToastVisible(true);
    }
  }

  return (
    <div className="my-3 rounded-lg border border-border-hairline bg-canvas p-3">
      <div className="flex items-center gap-3">
        {/* Stand-in product thumbnail. */}
        <div className="h-10 w-10 shrink-0 rounded-md bg-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body text-text-primary">Vintage film camera</p>
          <p className="text-label tabular-nums text-text-secondary">$48.00</p>
        </div>
        <div className="relative flex shrink-0 items-center">
          {variant === "saved-animation" && toastVisible && (
            <span
              key={toastNonce}
              role="status"
              aria-live="polite"
              onAnimationEnd={() => setToastVisible(false)}
              className="animate-save-demo-toast pointer-events-none absolute -top-7 right-0 inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border-hairline bg-surface px-2 py-0.5 text-label text-accent-green"
            >
              <Check className="size-3" aria-hidden />
              Saved!
            </span>
          )}
          <button
            type="button"
            onClick={handleToggle}
            aria-pressed={saved}
            className={
              saved
                ? `inline-flex items-center gap-1.5 rounded-md border border-accent-green/40 bg-accent-green/10 px-2.5 py-1.5 text-label text-accent-green ${
                    variant === "silent-instant" ? "transition-none" : ""
                  }`
                : `inline-flex items-center gap-1.5 rounded-md border border-border-hairline bg-surface px-2.5 py-1.5 text-label text-text-primary hover:bg-muted ${
                    variant === "silent-instant" ? "transition-none" : "transition-colors"
                  }`
            }
          >
            {saved ? (
              <BookmarkCheck className="size-3.5" aria-hidden />
            ) : (
              <Bookmark className="size-3.5 text-text-secondary" aria-hidden />
            )}
            {saved ? "Saved" : "Save for later"}
          </button>
        </div>
      </div>
    </div>
  );
}
