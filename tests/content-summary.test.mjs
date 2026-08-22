import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildContentIngestionReport } from '../scripts/lib/content-summary.mjs';

describe('Content Ingestion & Deployment Summary Engine', () => {
    test('generates valid markdown summary with default inputs', () => {
        const report = buildContentIngestionReport({
            contentDir: 'content/modules',
            version: 'v0.86.0',
            trigger: 'Weekly Scheduled Cron',
            targetUrl: 'https://learn.project-42.dev'
        });

        assert.ok(report.markdown.includes('Project 42 Platform — Content Ingestion & Deployment Summary'));
        assert.ok(report.markdown.includes('v0.86.0'));
        assert.ok(report.markdown.includes('Weekly Scheduled Cron'));
        assert.ok(report.markdown.includes('https://learn.project-42.dev'));
        assert.ok(report.markdown.includes('Schema Validation'));
    });

    test('renders updated modules when changedFiles are specified', () => {
        const report = buildContentIngestionReport({
            contentDir: 'content/modules',
            changedFiles: ['openai-ecosystem-and-interfaces.json'],
            version: 'v0.86.0',
            trigger: 'Orchard Event Dispatch',
            targetUrl: 'https://learn.project-42.dev'
        });

        assert.ok(report.markdown.includes('Curriculum Updates Ingested'));
        assert.ok(report.markdown.includes('Orchard Event Dispatch'));
    });
});
