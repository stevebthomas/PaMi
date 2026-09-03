"use client";

import { Fragment, type ReactNode } from "react";
import type { SimDoc } from "@/data/simDocs";
import { SaveDemo } from "@/components/docs/SaveDemo";

/**
 * The scrolling body of a single document's own window. The DesktopWindow
 * chrome (title bar with the doc title + FileText icon + close X) is supplied
 * by Desktop; this renders only the doc's content, so closing or scrolling one
 * doc window never disturbs another.
 *
 * Nothing here is doc-specific: a new SIM_DOCS entry shows up with zero changes.
 * The SaveDemo embeds and the {{demo}} marker are rendered exactly as before —
 * they simply live inside each doc's own window now.
 */
export function DocWindow({ doc }: { doc: SimDoc }) {
  return (
    <div className="h-full min-h-0 w-full overflow-y-auto bg-surface px-5 py-4 text-body leading-relaxed text-text-primary">
      {/* Cap line length so a wide window doesn't stretch prose to an
          unreadable measure; centered within the wider column. */}
      <div className="mx-auto max-w-[65ch]">{renderMarkdown(doc.markdown, doc.demo)}</div>
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
