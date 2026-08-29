"use client";

import { Fragment, type ReactNode } from "react";
import { useDocsStore } from "@/store/docsStore";
import { getSimDoc } from "@/data/simDocs";

/**
 * Generic in-sim document viewer. Reads the active doc id from docsStore and
 * renders SIM_DOCS[id]. Nothing here is doc-specific — a new SIM_DOCS entry
 * shows up with zero changes to this file.
 */
export function DocsApp() {
  const activeDocId = useDocsStore((s) => s.activeDocId);
  const doc = getSimDoc(activeDocId);

  if (!doc) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center p-6">
        <p className="text-sm text-ink-soft">No document open.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="pixel-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-ink">
        {renderMarkdown(doc.markdown)}
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
        <h2 key={`b${blocks.length}`} className="mb-2 mt-4 font-pixel text-sm text-ink">
          {renderInline(line.slice(3))}
        </h2>
      );
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      blocks.push(
        <h1 key={`b${blocks.length}`} className="mb-3 font-pixel text-base text-ink">
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
