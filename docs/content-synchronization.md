# Universal Content Synchronization Guide

Project 42 Platform supports three independent vectors for keeping curriculum up to date:

```text
                ┌─────────────────────────────────┐
                │ 1. Scheduled Weekly Cron        │
                │    (Every Sunday 00:00 UTC)     │
                └────────────────┬────────────────┘
                                 │
┌────────────────────────┐       │       ┌────────────────────────┐
│ 2. Manual Operator     │───────┼───────│ 3. Orchard Event Push  │
│    Workflow Dispatch   │       │       │    (Webhook Dispatch)  │
└────────────────────────┘       │       └────────────────────────┘
                                 │
                                 ▼
                ┌─────────────────────────────────┐
                │ Content Sync & Deployment Engine│
                │  • Pulls upstream content       │
                │  • Validates schemas & quizzes  │
                │  • Builds static export bundle  │
                │  • Deploys to configured target │
                │  • Posts Deployment Summary     │
                └─────────────────────────────────┘
```

---

## The 3 Sync Vectors

### Vector 1: Scheduled Weekly Cron
Runs automatically on Sundays at midnight UTC (`0 0 * * 0`) in GitHub Actions (`.github/workflows/content-sync.yml`).

### Vector 2: Manual UI Trigger
Operators can trigger an instant content pull and build by clicking **Run workflow** under the **Content Sync & Deployment** tab in GitHub Actions.

### Vector 3: Event-Driven Orchard Webhook
When Orchard finishes an authoring run, it dispatches a repository event (`content_updated`) to trigger immediate ingestion and deployment.

---

## Local / CLI Synchronization
To sync content manually on the command line:

```bash
npm run content:sync
npm test
npm run build
```
