"use client";

import {
  buildAssessmentHistory,
  buildCapstoneHistory,
  buildPortableLearnerRecord,
  buildTranscript,
  restorePortableLearnerRecord,
  serializePortableLearnerRecord,
} from "@project42/platform";
import { progressCatalog } from "../../lib/progressCatalog";
import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { clientCrossDomainHref } from "../lib/subdomainLinks";
import { useAuth } from "./AuthProvider";
import { useProgress } from "./ProgressProvider";
import { ProgressSnapshot } from "./ProgressSnapshot";
import { orgName } from "../../lib/copy";

export function ProfileDashboard() {
  const { account, apiFetch, configured } = useAuth();
  const {
    progress,
    hydrated,
    syncStatus,
    replaceProgress,
    rename,
    reset,
  } = useProgress();
  const [importStatus, setImportStatus] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);
  const [transcriptDownloadStatus, setTranscriptDownloadStatus] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);
  const [transcriptDownloadPending, setTranscriptDownloadPending] =
    useState(false);
  const transcript = useMemo(
    () => buildTranscript(progressCatalog, progress),
    [progress],
  );
  const assessmentHistory = useMemo(
    () => buildAssessmentHistory(progressCatalog, progress),
    [progress],
  );
  const capstoneHistory = useMemo(
    () => buildCapstoneHistory(progressCatalog, progress),
    [progress],
  );
  const exportDate = new Date().toISOString().slice(0, 10);
  const authoritativeAccountTranscript = account?.state === "approved";

  const downloadRecord = () => {
    const record = buildPortableLearnerRecord(progressCatalog, progress);
    downloadTextFile(
      `project-42-learning-record-${exportDate}.json`,
      serializePortableLearnerRecord(record),
      "application/json",
    );
  };

  const downloadTranscript = async () => {
    setTranscriptDownloadStatus(null);
    if (!authoritativeAccountTranscript) {
      setTranscriptDownloadStatus({
        kind: "error",
        message:
          "An authoritative transcript is available after the account is approved.",
      });
      return;
    }

    setTranscriptDownloadPending(true);
    try {
      const response = await apiFetch("/v1/me/transcript.csv");
      if (!response.ok) {
        const body = (await response
          .clone()
          .json()
          .catch(() => null)) as {
            error?: { code?: string };
          } | null;
        if (body?.error?.code === "recent_authentication_required") {
          throw new Error(
            "Sign out and sign in again before downloading your authoritative account transcript.",
          );
        }
        throw new Error(
          "The authoritative account transcript could not be downloaded. Try again.",
        );
      }
      if (
        !response.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("text/csv")
      ) {
        throw new Error(
          "The account service returned an invalid transcript. Try again.",
        );
      }
      const content = await response.text();
      if (!content.startsWith('"schema_version","record_authority","record_type"')) {
        throw new Error(
          "The account service returned an unsupported transcript. Try again.",
        );
      }
      downloadTextFile(
        `project42-authoritative-account-transcript-${exportDate}.csv`,
        content,
        "text/csv",
      );
      setTranscriptDownloadStatus({
        kind: "success",
        message:
          "Authoritative account transcript downloaded directly from your durable learner record.",
      });
    } catch (caught) {
      setTranscriptDownloadStatus({
        kind: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "The authoritative account transcript could not be downloaded. Try again.",
      });
    } finally {
      setTranscriptDownloadPending(false);
    }
  };

  const importRecord = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 1_000_000) {
      setImportStatus({
        kind: "error",
        message: `That file is too large. ${orgName} records must be under 1 MB.`,
      });
      return;
    }

    try {
      const parsed: unknown = JSON.parse(await file.text());
      const restored = restorePortableLearnerRecord(parsed, progressCatalog);
      if (!restored.valid) {
        setImportStatus({
          kind: "error",
          message: `This record cannot be restored: ${restored.errors.join("; ")}`,
        });
        return;
      }
      if (
        !window.confirm(
          "Replace the current progress with this record? If you have an approved account, the restored record will be synchronized to your account.",
        )
      ) {
        return;
      }
      replaceProgress(restored.progress);
      setImportStatus({
        kind: "success",
        message: `Restored ${restored.progress.completedModuleIds.length} completed modules, ${restored.progress.attempts.length} knowledge checks, and ${restored.progress.capstoneSubmissions?.length ?? 0} capstone submissions.`,
      });
    } catch {
      setImportStatus({
        kind: "error",
        message: `This file is not a valid ${orgName} JSON learning record.`,
      });
    }
  };

  if (!hydrated) {
    return <div className="profile-loading">Loading your progress…</div>;
  }

  return (
    <div className="profile-dashboard">
      <section className="profile-card account-sync-card" aria-labelledby="account-sync-title">
        <p className="eyebrow">Cross-device progress</p>
        <h2 id="account-sync-title">
          {syncStatus === "synced"
            ? "Progress is synchronized"
            : "Account progress status"}
        </h2>
        {!configured ? (
          <p>
            This deployment has not connected its account service yet. Sign in is
            unavailable.
          </p>
        ) : !account ? (
          <p>
            <Link href={clientCrossDomainHref("/account")}>Sign in</Link> to save your
            progress to your account and access it from any device.
          </p>
        ) : account.state !== "approved" ? (
          <p>
            Your account is {account.state}. Progress is held in memory until the
            account is approved.
          </p>
        ) : (
          <p>
            {syncStatus === "checking" && "Checking the server record…"}
            {syncStatus === "syncing" && "Saving your latest progress…"}
            {syncStatus === "synced" &&
              "Changes to modules, scores, transcripts, and badges are saved to your account."}
            {syncStatus === "error" &&
              "Synchronization failed. Your progress is held in memory and will be retried on the next change or page reload."}
          </p>
        )}
      </section>

      {/*
        The dashboard's "Continue learning" link goes to /learn/paths -- a list,
        not a place. This card names the module and links straight to it, and
        renders nothing when there is nothing to resume, so a learner who has
        just made an account still sees the profile they came for.
      */}
      <ProgressSnapshot />

      <section className="profile-card profile-identity">
        <p className="eyebrow">Learner profile</p>
        <h2>{progress.displayName}</h2>
        <p>
          {authoritativeAccountTranscript
            ? "Your progress is saved to your account and available on any device you sign in to."
            : "Sign in to save your progress to your account and access it from any device."}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            rename(String(form.get("displayName") ?? ""));
          }}
        >
          <label htmlFor="display-name">Display name</label>
          <div className="name-row">
            <input
              defaultValue={progress.displayName}
              id="display-name"
              key={progress.displayName}
              name="displayName"
            />
            <button className="button button-secondary" type="submit">
              Save
            </button>
          </div>
        </form>
      </section>

      <section className="profile-stats" aria-label="Learning statistics">
        <div>
          <span>{progress.completedModuleIds.length}</span>
          <small>Modules completed</small>
        </div>
        <div>
          <span>{progress.attempts.length}</span>
          <small>Knowledge checks</small>
        </div>
        <div>
          <span>{progress.badges.length}</span>
          <small>Badges earned</small>
        </div>
        <div>
          <span>{progress.capstoneSubmissions?.length ?? 0}</span>
          <small>Capstone submissions</small>
        </div>
      </section>

      <section className="transcript-section">
        <div className="section-heading section-heading-inline">
          <div>
            <p className="eyebrow">Transcript</p>
            <h2>Your paths</h2>
          </div>
          <Link className="text-link" href="/learn/paths">
            Continue learning
          </Link>
        </div>
        <p className="record-authority-note">
          {authoritativeAccountTranscript
            ? "This on-screen view reflects the latest account progress. The authoritative CSV is generated directly from your durable account record."
            : "This transcript is held in memory. Sign in to save it to your account."}
        </p>
        <div className="transcript-list">
          {transcript.map((entry) => (
            <article key={entry.pathId}>
              <div>
                <h3>{entry.pathTitle}</h3>
                <p>
                  {entry.completedModules} of {entry.totalModules} modules
                  {entry.bestScorePercent === null
                    ? ""
                    : ` · Best check ${entry.bestScorePercent}%`}
                </p>
              </div>
              <div
                aria-label={`${entry.pathTitle} completion`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={entry.completionPercent}
                className="transcript-progress"
                role="progressbar"
              >
                <span style={{ width: `${entry.completionPercent}%` }} />
              </div>
              <strong>{entry.completionPercent}%</strong>
            </article>
          ))}
        </div>
        <div className="profile-export" aria-labelledby="export-heading">
          <div>
            <h3 id="export-heading">Back up or move your progress</h3>
            <p>
              {authoritativeAccountTranscript
                ? "Download a local backup or request a spreadsheet-friendly authoritative transcript from your account. The server creates no public download link."
                : "Download or restore a portable JSON backup. An authoritative CSV transcript is available after account approval."}
            </p>
          </div>
          <div className="profile-transfer">
            <div className="button-row">
              <button
                className="button button-secondary"
                onClick={downloadRecord}
                type="button"
              >
                Download JSON record
              </button>
              <button
                className="button button-secondary"
                disabled={transcriptDownloadPending}
                onClick={() => void downloadTranscript()}
                type="button"
              >
                {transcriptDownloadPending
                  ? "Requesting authoritative transcript…"
                  : authoritativeAccountTranscript
                    ? "Download authoritative account CSV transcript"
                    : "Download CSV transcript"}
              </button>
            </div>
            <label className="record-import">
              <span>Restore a JSON record</span>
              <input
                accept="application/json,.json"
                aria-describedby="record-import-help"
                onChange={importRecord}
                type="file"
              />
            </label>
            <small id="record-import-help">
              Restoring replaces the current progress after confirmation.
            </small>
          </div>
        </div>
        {importStatus ? (
          <p
            className={`import-status import-status-${importStatus.kind}`}
            role={importStatus.kind === "error" ? "alert" : "status"}
          >
            {importStatus.message}
          </p>
        ) : null}
        {transcriptDownloadStatus ? (
          <p
            className={`import-status import-status-${transcriptDownloadStatus.kind}`}
            role={
              transcriptDownloadStatus.kind === "error" ? "alert" : "status"
            }
          >
            {transcriptDownloadStatus.message}
          </p>
        ) : null}
      </section>

      <section className="attempt-section" aria-labelledby="attempt-history-heading">
        <div className="section-heading section-heading-inline">
          <div>
            <p className="eyebrow">Assessment history</p>
            <h2 id="attempt-history-heading">Your scores</h2>
          </div>
          <span className="attempt-count">
            {assessmentHistory.length}{" "}
            {assessmentHistory.length === 1 ? "attempt" : "attempts"}
          </span>
        </div>
        {assessmentHistory.length > 0 ? (
          <div className="attempt-table-wrap">
            <table className="attempt-table">
              <thead>
                <tr>
                  <th scope="col">Module</th>
                  <th scope="col">Path</th>
                  <th scope="col">Score</th>
                  <th scope="col">Result</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {assessmentHistory.map((attempt) => (
                  <tr key={attempt.attemptId}>
                    <th scope="row">{attempt.moduleTitle}</th>
                    <td>{attempt.pathTitle}</td>
                    <td>{attempt.scorePercent}%</td>
                    <td>
                      <span
                        className={
                          attempt.passed ? "attempt-passed" : "attempt-not-passed"
                        }
                      >
                        {attempt.passed ? "Passed" : "Try again"}
                      </span>
                    </td>
                    <td>{new Date(attempt.completedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state attempt-empty">
            <h3>No scores yet.</h3>
            <p>Complete a module knowledge check and every attempt will appear here.</p>
            <Link className="button button-primary" href="/learn/paths">
              Choose a learning path
            </Link>
          </div>
        )}
      </section>

      <section className="attempt-section" aria-labelledby="capstone-history-heading">
        <div className="section-heading section-heading-inline">
          <div>
            <p className="eyebrow">Applied evidence</p>
            <h2 id="capstone-history-heading">Capstone history</h2>
          </div>
          <span className="attempt-count">
            {capstoneHistory.length}{" "}
            {capstoneHistory.length === 1 ? "submission" : "submissions"}
          </span>
        </div>
        {capstoneHistory.length > 0 ? (
          <div className="attempt-table-wrap">
            <table className="attempt-table">
              <thead>
                <tr>
                  <th scope="col">Capstone</th>
                  <th scope="col">Path</th>
                  <th scope="col">Score</th>
                  <th scope="col">Result</th>
                  <th scope="col">Artifacts</th>
                  <th scope="col">Evidence links</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {capstoneHistory.map((submission) => (
                  <tr key={submission.id}>
                    <th scope="row">{submission.capstoneTitle}</th>
                    <td>{submission.pathTitle}</td>
                    <td>{submission.scorePercent}%</td>
                    <td>
                      <span
                        className={
                          submission.passed
                            ? "attempt-passed"
                            : "attempt-not-passed"
                        }
                      >
                        {submission.passed ? "Passed" : "Revise"}
                      </span>
                    </td>
                    <td>{submission.artifactRefs.length}</td>
                    <td>
                      {submission.criterionScores.reduce(
                        (total, score) =>
                          total + (score.evidenceRefs?.length ?? 0),
                        0,
                      )}
                    </td>
                    <td>{new Date(submission.submittedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state attempt-empty">
            <h3>No capstone evidence yet.</h3>
            <p>
              Complete a path capstone to add applied evidence, revisions, and
              criterion scores to your portable record and transcript.
            </p>
            <Link
              className="button button-primary"
              href="/learn/paths"
            >
              Choose a learning path
            </Link>
          </div>
        )}
      </section>

      <section
        aria-labelledby="learning-achievements-heading"
        className="badge-section"
      >
        <div className="section-heading">
          <p className="eyebrow">Learning achievements</p>
          <h2 id="learning-achievements-heading">Evidence in your progress record</h2>
        </div>
        <p className="record-authority-note">
          {authoritativeAccountTranscript
            ? "These achievements can be synchronized in your durable account progress, but they are not issued credentials."
            : "These achievements are not issued credentials."}
        </p>
        {progress.badges.length ? (
          <div className="badge-grid">
            {progress.badges.map((badge) => (
              <article key={badge.id}>
                <div className="badge-medallion">42</div>
                <h3>{badge.name}</h3>
                <p>{badge.description}</p>
                <small>
                  Earned {new Date(badge.earnedAt).toLocaleDateString()} · Not an
                  issued credential
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>Your first badge is waiting.</h3>
            <p>
              Complete every required check and capstone in a path to earn its
              mastery badge.
            </p>
            <Link className="button button-primary" href="/learn/ai-foundations">
              Start AI Foundations
            </Link>
          </div>
        )}
      </section>

      <section
        aria-labelledby="durable-credentials-heading"
        className="badge-section"
      >
        <div className="section-heading">
          <p className="eyebrow">Credentials</p>
          <h2 id="durable-credentials-heading">Durable issued credentials</h2>
        </div>
        <div className="empty-state">
          <h3>No durable credentials have been issued.</h3>
          <p>
            A durable credential requires server-side issuance against versioned
            evidence and an append-only lifecycle. Learning achievements do not appear
            here as verified credentials.
          </p>
        </div>
      </section>

      {progress.attempts.length || (progress.capstoneSubmissions?.length ?? 0) > 0 ? (
        <details className="reset-panel">
          <summary>Manage learning progress</summary>
          <p>Resetting removes progress, scores, and badges from your account.</p>
          <button
            className="button button-danger"
            onClick={() => {
              // The confirm has to name what is destroyed and where, because
              // this is not a local clear: it writes an empty record over the
              // account, the server replaces rather than merges, and there is
              // no undo. "Reset all progress?" did not say any of that.
              if (
                window.confirm(
                  `Permanently delete all ${progress.completedModuleIds.length} completed modules, ${progress.attempts.length} knowledge checks, ${progress.capstoneSubmissions?.length ?? 0} capstone submissions and ${progress.badges.length} badges from your ${orgName} account? This cannot be undone. Export your record first if you want to keep a copy.`,
                )
              ) {
                reset();
              }
            }}
            type="button"
          >
            Reset account progress
          </button>
        </details>
      ) : null}
    </div>
  );
}

function downloadTextFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
