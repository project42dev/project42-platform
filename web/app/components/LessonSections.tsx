import type { LessonSection } from "@project42/platform";
import { CopyCodeButton } from "./CopyCodeButton";

export function LessonSections({ sections }: { sections: LessonSection[] }) {
  return (
    <div className="lesson-sections">
      {sections.map((section, index) => (
        <section className="lesson-block" id={section.id} key={section.id}>
          <div className="lesson-block-index">{String(index + 1).padStart(2, "0")}</div>
          <div>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.callout ? <aside className="lesson-callout">{section.callout}</aside> : null}
            {section.code ? (
              <div className="code-example">
                <div className="code-label">
                  <span>{section.code.label}</span>
                  <div className="code-tools">
                    <span>{section.code.language}</span>
                    <CopyCodeButton code={section.code.code} />
                  </div>
                </div>
                <pre
                  aria-label={`${section.code.label} code example`}
                  tabIndex={0}
                >
                  <code>{section.code.code}</code>
                </pre>
              </div>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
