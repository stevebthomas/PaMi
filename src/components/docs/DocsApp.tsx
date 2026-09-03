"use client";

import { Fragment, type ReactNode } from "react";
import { X } from "lucide-react";
import { useDocsStore } from "@/store/docsStore";
import { useSimStore } from "@/store/simStore";
import { getSimDoc, type SimDoc } from "@/data/simDocs";
import { AppIcon } from "@/components/shared/AppIcon";
import { SaveDemo } from "@/components/docs/SaveDemo";

/**
 * Generic in-sim document viewer/library. Reads the open panes from docsStore:
 * an empty list (or only ids that don't resolve in SIM_DOCS) shows the library,
 * a grid of tiles for every doc the player has opened so far
 * (stateBag.openedDocIds); otherwise it renders the open docs as a split view.
 *
 * Up to two docs are shown at once so the player can compare Maya's mockups
 * side by side. Two panes render with a hairline divider (side-by-side, or
 * stacked when the window is too narrow for a readable split); one pane fills
 * the width. Each pane keeps its own scroll and its own quiet close affordance;
 * closing the last pane returns to the library. Nothing here is doc-specific: a
 * new SIM_DOCS entry shows up with zero changes to this file.
 */
export function DocsApp() {
  const openDocIds = useDocsStore((s) => s.openDocIds);
  const setActiveDoc = useDocsStore((s) => s.setActiveDoc);
  const closeDoc = useDocsStore((s) => s.closeDoc);
  const openedDocIds = useSimStore((s) => s.stateBag.openedDocIds);
  const recordDocOpened = useSimStore((s) => s.recordDocOpened);

  const openDocs = openDocIds
    .map((id) => getSimDoc(id))
    .filter((d): d is SimDoc => Boolean(d));

  if (openDocs.length === 0) {
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
                setActiveDoc(d.id);
                recordDocOpened(d.id);
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

  return (
    // @container so the split tracks the DOCS WINDOW width, not the viewport.
    // Two panes sit side by side once the window is wide enough for a readable
    // split (@xl ≈ 36rem, which the 640px default Docs window clears, so
    // comparison is side-by-side out of the box); narrower than that they stack
    // vertically rather than clip.
    <div className="@container flex h-full min-h-0 w-full flex-col bg-surface">
      <div className="flex min-h-0 flex-1 flex-col @xl:flex-row">
        {openDocs.map((doc, i) => (
          <DocPane
            key={doc.id}
            doc={doc}
            // Hairline divider BETWEEN panes only: a top border when stacked, a
            // left border when side by side. First pane carries none.
            isDivided={i > 0}
            onClose={() => closeDoc(doc.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** One document pane: its own header (filename + quiet close) and its own
 * independently scrolling body, so closing or scrolling one never disturbs the
 * other. */
function DocPane({
  doc,
  isDivided,
  onClose,
}: {
  doc: SimDoc;
  isDivided: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col ${
        isDivided
          ? "border-t border-border-hairline @xl:border-l @xl:border-t-0"
          : ""
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-hairline px-3 py-2">
        <span className="truncate text-label text-text-secondary">{doc.filename}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${doc.filename}`}
          title="Close"
          className="shrink-0 rounded-md p-1 text-text-secondary hover:bg-muted hover:text-text-primary"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-body leading-relaxed text-text-primary">
        {/* Cap line length so a wide pane doesn't stretch prose to an unreadable
            measure; centered within the wider column. */}
        <div className="mx-auto max-w-[65ch]">{renderMarkdown(doc.markdown, doc.demo)}</div>
      </div>
    </div>
  );
}

/**
 * Deliberately tiny, dependency-free markdown renderer, SCOPED to exactly the
 * subset the sim's docs use, no more:
 *   - `# ` / `## ` headings
 *   - `---` horizontal rule
 *   - `- ` bullet lists (consecutive bullets grouped into one <ul>)
 *   - `**bold**` and `*italic*` inline emphasis
 *   - blank-line-separated paragraphs
 *   - a `{{demo}}` marker line, replaced by the interactive SaveDemo when the
 *     doc declares a `demo` variant (otherwise the marker line renders nothing,
 *     so the renderer stays generic and SimDoc stays pure data)
 * It is not a general markdown parser; anything outside this subset renders as
 * plain text. Readability over cleverness.
 */
function renderMarkdown(markdown: string, demo?: SimDoc["demo"]): ReactNode {
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

    if (line.trim() === "{{demo}}") {
      flushParagraph();
      // Only emit the interactive demo when the doc opts in via its `demo`
      // field; an unmatched marker renders nothing rather than literal text.
      if (demo) {
        blocks.push(<SaveDemo key={`b${blocks.length}`} variant={demo} />);
      }
      continue;
    }

    if (line === "---") {
      flushParagraph();
      blocks.push(<hr key={`b${blocks.length}`} className="my-4 border-t border-border-hairline" />);
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      blocks.push(
        <h2 key={`b${blocks.length}`} className="mb-2 mt-4 text-body font-semibold text-text-primary">
          {renderInline(line.slice(3))}
        </h2>
      );
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      blocks.push(
        <h1 key={`b${blocks.length}`} className="mb-3 text-subheading font-semibold text-text-primary">
          {renderInline(line.slice(2))}
        </h1>
      );
      continue;
    }

    // Plain text: accumulate into the current paragraph.
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
