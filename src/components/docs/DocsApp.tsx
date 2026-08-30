"use client";

import { Fragment, type ReactNode } from "react";
import { useDocsStore } from "@/store/docsStore";
import { useSimStore } from "@/store/simStore";
import { getSimDoc } from "@/data/simDocs";
import { AppIcon } from "@/components/shared/AppIcon";

/**
 * Generic in-sim document viewer/library. Reads the active doc id from
 * docsStore: null (or an id that doesn't resolve in SIM_DOCS) shows the
 * library — a grid of tiles for every doc the player has opened so far
 * (stateBag.openedDocIds) — otherwise it renders the doc itself. Nothing
 * here is doc-specific — a new SIM_DOCS entry shows up with zero changes to
 * this file.
 */
export function DocsApp() {
  const activeDocId = useDocsStore((s) => s.activeDocId);
  const setActiveDoc = useDocsStore((s) => s.setActiveDoc);
  const closeDoc = useDocsStore((s) => s.closeDoc);
  const openedDocIds = useSimStore((s) => s.stateBag.openedDocIds);
  const recordDocOpened = useSimStore((s) => s.recordDocOpened);
  const doc = getSimDoc(activeDocId);

  if (!doc) {
    const tiles = openedDocIds
      .map((id) => getSimDoc(id))
      .filter((d): d is NonNullable<typeof d> => Boolean(d));

    if (tiles.length === 0) {
      return (
        <div className="flex h-full min-h-0 w-full items-center justify-center p-6">
          <p className="text-body text-ink-soft">
            No documents yet. Files people send you will show up here.
          </p>
        </div>
      );
    }

    return (
      <div className="@container pixel-scrollbar h-full min-h-0 w-full overflow-y-auto p-4">
        {/* Tile columns track the DOCS WINDOW width, not the viewport: 1-up when
            very narrow, 2-up past @2xs (18rem), 3-up past @lg (32rem). */}
        <div className="grid grid-cols-1 gap-3 @2xs:grid-cols-2 @lg:grid-cols-3">
          {tiles.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setActiveDoc(d.id);
                recordDocOpened(d.id);
              }}
              className="pixel-border flex flex-col items-center gap-2 bg-white px-2 py-3 text-center hover:-translate-y-0.5"
            >
              <AppIcon id="docs" sizeClassName="h-8 w-8" />
              <span className="text-label text-ink">{d.filename}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 items-center border-b border-ink/10 px-3 py-2">
        <button
          type="button"
          onClick={closeDoc}
          className="pixel-border bg-white px-2 py-1 text-label text-ink hover:-translate-y-0.5"
        >
          ← Library
        </button>
      </div>
      <div className="pixel-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 text-body leading-relaxed text-ink">
        {/* Cap line length so a wide docs window doesn't stretch prose to an
            unreadable measure; centered within the wider column. */}
        <div className="mx-auto max-w-[65ch]">{renderMarkdown(doc.markdown)}</div>
      </div>
    </div>
  );
}

/**
 * Deliberately tiny, dependency-free markdown renderer, SCOPED to exactly the
 * subset the sim's docs use — no more:
 *   - `# ` / `## ` headings
 *   - `---` horizontal rule
 *   - `- ` bullet lists (consecutive bullets grouped into one <ul>)
 *   - `**bold**` and `*italic*` inline emphasis
 *   - blank-line-separated paragraphs
 * It is not a general markdown parser; anything outside this subset renders as
 * plain text. Readability over cleverness.
 */
function renderMarkdown(markdown: string): ReactNode {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];

  // Buffers for the two multi-line block kinds we group across lines.
  let paragraph: string[] = [];
  let bullets: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={`b${blocks.length}`} className="mb-3">
        {renderInline(paragraph.join(" "))}
      </p>
    );
    paragraph = [];
  }

  function flushBullets() {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`b${blocks.length}`} className="mb-3 list-disc space-y-1 pl-5">
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>
    );
    bullets = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      // Blank line ends whatever block was open.
      flushParagraph();
      flushBullets();
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      bullets.push(line.slice(2));
      continue;
    }

    // Any non-bullet line ends an open bullet list.
    flushBullets();

    if (line === "---") {
      flushParagraph();
      blocks.push(<hr key={`b${blocks.length}`} className="my-4 border-t-2 border-ink/20" />);
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      blocks.push(
        <h2 key={`b${blocks.length}`} className="mb-2 mt-4 font-pixel text-body text-ink">
          {renderInline(line.slice(3))}
        </h2>
      );
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      blocks.push(
        <h1 key={`b${blocks.length}`} className="mb-3 font-pixel text-subheading text-ink">
          {renderInline(line.slice(2))}
        </h1>
      );
      continue;
    }

    // Plain text — accumulate into the current paragraph.
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushBullets();

  return blocks;
}

/** Inline emphasis for the scoped subset: `**bold**` and `*italic*`, no
 * nesting (matches how the docs actually use them). Splits on either delimiter
 * and wraps the captured runs; everything else is plain text. */
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
