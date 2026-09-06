import Link from "next/link";
import { orgName } from "../../lib/copy";

type ContentUseNoticeProps = {
  artifact: "resource" | "visual guide";
};

export function ContentUseNotice({ artifact }: ContentUseNoticeProps) {
  return (
    <aside
      aria-labelledby={`content-use-${artifact.replace(" ", "-")}`}
      className="content-use-notice"
      role="note"
    >
      <div>
        <p className="eyebrow">Use with verification</p>
        <h2 id={`content-use-${artifact.replace(" ", "-")}`}>
          Helpful evidence, not a guarantee
        </h2>
      </div>
      <p>
        This {artifact} can become stale or contain errors despite source review,
        automated checks, multiple-model review, and human approval. Verify
        important decisions against the named primary sources. {orgName} original
        learning material is reusable under CC BY 4.0; third-party material keeps
        its owners&apos; terms.
      </p>
      <Link href="/legal-transparency">
        Legal, licensing, and AI transparency →
      </Link>
    </aside>
  );
}
