import Link from "next/link";
import type { ReactNode } from "react";

// Copy strings may carry inline links written as [label](href), so a sentence
// with a citation in the middle of it stays one editable string in
// copy/defaults.ts -- and one editable string in an adopter's
// project42.copy.json -- instead of being split into three JSX fragments that
// only a developer can reassemble.
//
// Nothing else is interpreted. This is not Markdown: copy is prose, and a
// general Markdown renderer would let an override introduce arbitrary
// structure into a page whose layout is product.
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

export function renderCopy(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  let cursor = 0;
  LINK.lastIndex = 0;
  for (let match = LINK.exec(value); match; match = LINK.exec(value)) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index));
    const label = match[1] as string;
    const href = match[2] as string;
    nodes.push(
      href.startsWith("/") ? (
        <Link href={href} key={`link-${index}`}>
          {label}
        </Link>
      ) : (
        <a href={href} key={`link-${index}`}>
          {label}
        </a>
      ),
    );
    cursor = match.index + match[0].length;
    index += 1;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

export function RichText({ value }: { value: string }) {
  return <>{renderCopy(value)}</>;
}
