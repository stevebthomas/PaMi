"use client";

import { useDocsStore } from "@/store/docsStore";
import { useSimStore } from "@/store/simStore";
import { getSimDoc, type SimDoc } from "@/data/simDocs";
import { AppIcon } from "@/components/shared/AppIcon";

/**
 * The Docs app window: the LIBRARY ONLY. It shows a grid of tiles for every doc
 * the player has received so far (stateBag.openedDocIds), or an empty state
 * when none have arrived yet.
 *
 * Clicking a tile does NOT render the doc here: it opens the document as its
 * OWN independent window (draggable, resizable, own title bar and close X — see
 * DocWindow + Desktop) via openDocRequest, exactly like a Chattr attachment
 * chip. This library window stays open behind it. Nothing here is doc-specific:
 * a new SIM_DOCS entry shows up with zero changes to this file.
 */
export function DocsApp() {
  const openDocRequest = useDocsStore((s) => s.openDocRequest);
  const openedDocIds = useSimStore((s) => s.stateBag.openedDocIds);
  const recordDocOpened = useSimStore((s) => s.recordDocOpened);

  const tiles = openedDocIds
    .map((id) => getSimDoc(id))
    .filter((d): d is SimDoc => Boolean(d));

  if (tiles.length === 0) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-canvas p-6">
        <p className="text-body text-text-secondary">
          No documents yet. Files people send you will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="@container h-full min-h-0 w-full overflow-y-auto bg-canvas p-4">
      {/* Tile columns track the DOCS WINDOW width, not the viewport: 1-up when
          very narrow, 2-up past @2xs (18rem), 3-up past @lg (32rem). */}
      <div className="grid grid-cols-1 gap-3 @2xs:grid-cols-2 @lg:grid-cols-3">
        {tiles.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              recordDocOpened(d.id);
              openDocRequest(d.id);
            }}
            className="flex flex-col items-center gap-2 rounded-lg border border-border-hairline bg-surface px-2 py-3 text-center hover:bg-muted"
          >
            <AppIcon id="docs" sizeClassName="h-8 w-8" />
            <span className="text-label text-text-primary">{d.filename}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
