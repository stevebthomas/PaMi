import { Fragment, type ReactNode } from "react";

/** Inline emphasis for message content: `**bold**` and `*italic*` only —
 * no links, no headings, no block parsing. Single-pass split, returns React
 * nodes (no dangerouslySetInnerHTML), adapted from DocsApp's renderInline
 * so content like the 9:00 standup digest or Ask Claude replies doesn't
 * render literal asterisks. */
export function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
