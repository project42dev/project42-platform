import type { Metadata } from "next";
import Link from "next/link";
import {
  accountServiceConfigured,
  learnerDataPolicy as policy,
} from "../lib/learnerDataPolicy";
import { copy } from "../../lib/copy";
import { RichText } from "../components/RichText";

const text = copy.learnerData;

export const metadata: Metadata = {
  title: text.metaTitle,
  description: text.metaDescription,
};

function label(value: string) {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Copy strings may leave a {placeholder} for a value that comes from the
// platform contract rather than from the copy layer, so the sentence around a
// live number stays one editable string.
function fill(value: string, vars: Record<string, string | number>) {
  return value.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

export default function LearnerDataPage() {
  return (
    <main className="page-shell shell learner-data-page">
      <header className="page-hero learner-data-hero">
        <p className="eyebrow">{text.hero.eyebrow}</p>
        <h1>{text.hero.heading}</h1>
        <p>{text.hero.lede}</p>
        <Link
          className="text-link"
          href="/legal-transparency"
        >
          {text.hero.legalLink}
        </Link>
      </header>

      <section className="policy-status" aria-labelledby="policy-status-title">
        <div>
          <p className="eyebrow">{text.status.eyebrow}</p>
          <h2 id="policy-status-title">{text.status.heading}</h2>
          <p>
            {accountServiceConfigured
              ? text.status.configured
              : text.status.notConfigured}
          </p>
          <p>
            <RichText value={text.status.exportNote} />
          </p>
        </div>
        <dl>
          <div>
            <dt>{text.status.recordsTerm}</dt>
            {/*
              The policy states what the software supports; this states what this
              deployment offers. An unconfigured or self-hosted build must not
              imply durable records it cannot store (AB#6425).
            */}
            <dd>
              {policy.accountBackedRecords === "available" &&
                accountServiceConfigured
                ? text.status.recordsAvailable
                : text.status.recordsNotEnabled}
            </dd>
          </div>
          <div>
            <dt>{text.status.policyVersionTerm}</dt>
            <dd>{policy.policyVersion}</dd>
          </div>
          <div>
            <dt>{text.status.hostedCollectionTerm}</dt>
            <dd>
              {accountServiceConfigured
                ? text.status.hostedCollectionValue
                : text.status.hostedCollectionNotEnabled}
            </dd>
          </div>
        </dl>
      </section>

      <section className="policy-section" aria-labelledby="identity-heading">
        <div className="policy-section-heading">
          <p className="eyebrow">{text.identity.eyebrow}</p>
          <h2 id="identity-heading">{text.identity.heading}</h2>
          <p>{text.identity.body}</p>
        </div>
        <div className="policy-fact-grid">
          {text.identity.facts.map((fact) => (
            <article key={fact.number}>
              <span>{fact.number}</span>
              <h3>{fact.title}</h3>
              <p>{fact.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="policy-section" aria-labelledby="lifecycle-heading">
        <div className="policy-section-heading">
          <p className="eyebrow">{text.lifecycle.eyebrow}</p>
          <h2 id="lifecycle-heading">{text.lifecycle.heading}</h2>
          <p>{text.lifecycle.body}</p>
        </div>
        <ol className="policy-lifecycle">
          {policy.lifecycle.states.map((state) => {
            const next = policy.lifecycle.transitions
              .filter((transition) => transition.from === state)
              .map((transition) => label(transition.to));
            return (
              <li key={state}>
                <strong>{label(state)}</strong>
                <span>
                  {next.length
                    ? fill(text.lifecycle.mayMoveTo, { states: next.join(", ") })
                    : text.lifecycle.terminalState}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="policy-section" aria-labelledby="consent-heading">
        <div className="policy-section-heading">
          <p className="eyebrow">{text.consent.eyebrow}</p>
          <h2 id="consent-heading">{text.consent.heading}</h2>
          <p>{text.consent.body}</p>
        </div>
        <div
          className="policy-table-wrap"
          tabIndex={0}
          aria-label={text.consent.tableLabel}
        >
          <table className="policy-table">
            <thead>
              <tr>
                <th scope="col">{text.consent.columnPurpose}</th>
                <th scope="col">{text.consent.columnRequired}</th>
                <th scope="col">{text.consent.columnEffect}</th>
                <th scope="col">{text.consent.columnWithdrawn}</th>
              </tr>
            </thead>
            <tbody>
              {policy.consent.purposes.map((purpose) => (
                <tr key={purpose.id}>
                  <th scope="row">{label(purpose.id)}</th>
                  <td>
                    {purpose.required
                      ? text.consent.requiredYes
                      : text.consent.requiredNo}
                  </td>
                  <td>{purpose.description}</td>
                  <td>{purpose.withdrawalEffect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="policy-section" aria-labelledby="retention-heading">
        <div className="policy-section-heading">
          <p className="eyebrow">{text.retention.eyebrow}</p>
          <h2 id="retention-heading">{text.retention.heading}</h2>
          <p>{text.retention.body}</p>
        </div>
        <div className="policy-control-grid">
          <article>
            <strong>
              {policy.deletion.cancellationWindowDays} {text.retention.daysUnit}
            </strong>
            <h3>{text.retention.cancellation.title}</h3>
            <p>{text.retention.cancellation.body}</p>
          </article>
          <article>
            <strong>
              {policy.deletion.activeStoreCompletionDays}{" "}
              {text.retention.daysUnit}
            </strong>
            <h3>{text.retention.activeStore.title}</h3>
            <p>{text.retention.activeStore.body}</p>
          </article>
          <article>
            <strong>
              {policy.deletion.backupExpiryDays} {text.retention.daysUnit}
            </strong>
            <h3>{text.retention.backupExpiry.title}</h3>
            <p>{text.retention.backupExpiry.body}</p>
          </article>
          <article>
            <strong>
              {fill(text.retention.recovery.objective, {
                rpo: policy.recovery.recoveryPointHours,
                rto: policy.recovery.recoveryTimeHours,
              })}
            </strong>
            <h3>{text.retention.recovery.title}</h3>
            <p>
              {fill(text.retention.recovery.body, {
                days: policy.recovery.restoreTestCadenceDays,
              })}
            </p>
          </article>
        </div>
      </section>

      <section className="policy-section" aria-labelledby="export-heading">
        <div className="policy-section-heading">
          <p className="eyebrow">{text.export.eyebrow}</p>
          <h2 id="export-heading">{text.export.heading}</h2>
        </div>
        <div className="policy-two-column">
          <article>
            <h3>{text.export.exportTitle}</h3>
            <ul>
              {text.export.exportItems.map((item) => (
                <li key={item}>
                  {fill(item, {
                    minutes: policy.export.recentAuthenticationMinutes,
                  })}
                </li>
              ))}
            </ul>
          </article>
          <article>
            <h3>{text.export.deletionTitle}</h3>
            <ol>
              {text.export.deletionSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>
        </div>
      </section>

      <section className="policy-section" aria-labelledby="roles-heading">
        <div className="policy-section-heading">
          <p className="eyebrow">{text.roles.eyebrow}</p>
          <h2 id="roles-heading">{text.roles.heading}</h2>
          <p>{text.roles.body}</p>
        </div>
        <div className="policy-role-grid">
          {policy.authorization.grants.map((grant) => (
            <article key={grant.role}>
              <h3>{label(grant.role)}</h3>
              <p>{grant.boundary}</p>
              <small>
                {fill(text.roles.permissionCount, {
                  count: grant.permissions.length,
                })}
              </small>
            </article>
          ))}
        </div>
      </section>

      <section className="policy-machine-readable">
        <div>
          <p className="eyebrow">{text.machineReadable.eyebrow}</p>
          <h2>{text.machineReadable.heading}</h2>
          <p>{text.machineReadable.body}</p>
        </div>
        <a className="button button-primary" href="/learner-data/policy">
          {text.machineReadable.action}
        </a>
      </section>
    </main>
  );
}
