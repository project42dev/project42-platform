import type { LearningModule, SourceReference } from "@project42/platform";

type ComparisonMatrix = NonNullable<LearningModule["comparisonMatrix"]>;

const statusLabels = {
  documented: "Documented",
  changing: "Changing",
  "non-equivalent": "Non-equivalent",
  unknown: "Unknown",
} as const;

export function ProviderComparisonMatrix({
  matrix,
  sources,
}: {
  matrix: ComparisonMatrix;
  sources: SourceReference[];
}) {
  const sourcesByUrl = new Map(sources.map((source) => [source.url, source]));

  return (
    <section
      className="provider-comparison"
      aria-labelledby="provider-comparison-title"
    >
      <div className="comparison-heading">
        <div>
          <p className="eyebrow">Portable decision tool</p>
          <h2 id="provider-comparison-title">Provider comparison matrix</h2>
        </div>
        <span>Verified {matrix.asOf}</span>
      </div>
      <p className="comparison-caveat">{matrix.caveat}</p>
      <ul className="comparison-legend" aria-label="Comparison status legend">
        {Object.entries(statusLabels).map(([status, label]) => (
          <li key={status}>
            <span className={`comparison-status status-${status}`}>{label}</span>
          </li>
        ))}
      </ul>
      <div
        className="comparison-table-wrap"
        aria-labelledby="provider-comparison-title"
        role="region"
        tabIndex={0}
      >
        <table className="comparison-table">
          <caption>
            Anthropic, OpenAI, and Google developer-surface comparison as of{" "}
            {matrix.asOf}
          </caption>
          <thead>
            <tr>
              <th scope="col">Dimension and portable core</th>
              <th scope="col">Anthropic</th>
              <th scope="col">OpenAI</th>
              <th scope="col">Google</th>
            </tr>
          </thead>
          <tbody>
            {matrix.dimensions.map((dimension) => (
              <tr key={dimension.id}>
                <th scope="row">
                  <strong>{dimension.title}</strong>
                  <span>{dimension.portableCore}</span>
                </th>
                {(["anthropic", "openai", "google"] as const).map((provider) => {
                  const cell = dimension.providers[provider];
                  return (
                    <td key={provider}>
                      <span
                        className={`comparison-status status-${cell.status}`}
                      >
                        {statusLabels[cell.status]}
                      </span>
                      <p>{cell.summary}</p>
                      <ul className="comparison-sources">
                        {cell.sourceUrls.map((url) => {
                          const source = sourcesByUrl.get(url);
                          return (
                            <li key={url}>
                              <a href={url} rel="noreferrer" target="_blank">
                                {source?.title ?? "Official source"}
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
