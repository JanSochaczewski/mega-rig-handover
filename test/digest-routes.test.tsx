import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

let testRunsDir: string;

const baseConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
};

beforeEach(() => {
  testRunsDir = mkdtempSync(join(tmpdir(), 'digest-test-'));
});

afterEach(() => {
  rmSync(testRunsDir, { recursive: true, force: true });
});

function jobRow(html: string, job: string): string {
  const row = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)?.find((candidate) => candidate.includes(job));
  expect(row, `table row for ${job}`).toBeDefined();
  return row!;
}

function accessibleText(html: string): string {
  const labels = [...html.matchAll(/\b(?:aria-label|title)=["']([^"']*)["']/gi)]
    .map((match) => match[1]);
  return [html.replace(/<[^>]*>/g, ' '), ...labels].join(' ').replace(/\s+/g, ' ').trim();
}

describe('digest routes', () => {
  describe('GET /digest/:night', () => {
    it('returns 200 with valid night data', async () => {
      const night = '2026-10-28';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-28T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}\n` +
          `{"at":"2026-10-28T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/digest/${night}`);
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('rig/rotate-logs');
      expect(html).toContain('lane/sync');
    });

    it('returns 404 for missing night', async () => {
      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request('/digest/2026-10-29');
      expect(res.status).toBe(404);
    });

    it('renders "nothing ran" for empty night', async () => {
      const night = '2026-10-27';
      writeFileSync(join(testRunsDir, `${night}.jsonl`), '');

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/digest/${night}`);
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('nothing ran');
    });

    it('renders valid rows despite a bad line', async () => {
      const night = '2026-10-28';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-28T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}\n` +
          `invalid json line\n` +
          `{"at":"2026-10-28T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/digest/${night}`);
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(jobRow(html, 'rig/rotate-logs')).toContain('lane-07');
      expect(jobRow(html, 'lane/sync')).toContain('rook');
    });

    it('handles null owner with emdash', async () => {
      const night = '2026-10-29';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-29T05:41:09+01:00","job":"digest/render","status":"ok","owner":null}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/digest/${night}`);
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('digest/render');
      expect(jobRow(html, 'digest/render')).toMatch(/—|&mdash;|&#8212;|&#x2014;/i);
    });

    it('marks retries >= 3 and failures accessibly', async () => {
      const night = '2026-10-29';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-29T01:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}\n` +
          `{"at":"2026-10-29T01:31:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}\n` +
          `{"at":"2026-10-29T01:33:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}\n` +
          `{"at":"2026-10-29T01:37:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}\n` +
          `{"at":"2026-10-29T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/digest/${night}`);
      expect(res.status).toBe(200);

      const html = await res.text();
      const retries = jobRow(html, 'fixtures/refresh');
      const failure = jobRow(html, 'notes/backup');
      expect(accessibleText(retries)).toMatch(/retr(?:y|ies)/i);
      expect(accessibleText(retries)).toMatch(/\b3\b/);
      expect(accessibleText(failure)).toMatch(/fail(?:ed|ure)?/i);
      expect(accessibleText(failure)).toContain('quota exceeded');
    });

    it('sorts rows by job name', async () => {
      const night = '2026-10-28';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-28T23:00:02+01:00","job":"zebra/job","status":"ok","owner":"lane-07"}\n` +
          `{"at":"2026-10-28T23:00:06+01:00","job":"alpha/job","status":"ok","owner":"rook"}\n` +
          `{"at":"2026-10-28T23:00:10+01:00","job":"middle/job","status":"ok","owner":"rook"}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/digest/${night}`);
      expect(res.status).toBe(200);

      const html = await res.text();

      const alphaIdx = html.indexOf('alpha/job');
      const middleIdx = html.indexOf('middle/job');
      const zebraIdx = html.indexOf('zebra/job');

      expect(alphaIdx).toBeGreaterThanOrEqual(0);
      expect(middleIdx).toBeGreaterThanOrEqual(0);
      expect(zebraIdx).toBeGreaterThanOrEqual(0);
      expect(alphaIdx).toBeLessThan(middleIdx);
      expect(middleIdx).toBeLessThan(zebraIdx);
    });

    it('preserves timestamp offsets without converting to UTC', async () => {
      const night = '2026-10-28';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-28T23:00:02+01:00","job":"test/job","status":"ok","owner":"rook"}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/digest/${night}`);
      expect(res.status).toBe(200);
      const html = await res.text();

      expect(jobRow(html, 'test/job')).toContain('+01:00');
    });

    it('escapes XSS in error messages', async () => {
      const night = '2026-10-28';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-28T23:00:02+01:00","job":"test/job","status":"fail","owner":"rook","error":"<script>alert('xss')</script>"}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/digest/${night}`);
      expect(res.status).toBe(200);
      const html = await res.text();

      expect(html).not.toMatch(/<script\b/i);
      const errorRow = jobRow(html, 'test/job');
      expect(errorRow).toContain('&lt;script&gt;');
      expect(errorRow).toContain('&lt;/script&gt;');
      expect(errorRow).toContain('xss');
    });
  });

  describe('GET /api/digest/:night', () => {
    it('returns 200 with valid JSON', async () => {
      const night = '2026-10-28';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-28T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}\n` +
          `{"at":"2026-10-28T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/api/digest/${night}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/application\/json/);

      const json = (await res.json()) as {
        rows: DigestRow[];
        badLines: number;
      };
      expect(json).toEqual({
        rows: [
          {
            job: 'lane/sync', owner: 'rook', runs: 1, retries: 0,
            lastStatus: 'ok', lastError: null,
            firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-28T23:00:06+01:00',
          },
          {
            job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0,
            lastStatus: 'ok', lastError: null,
            firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
          },
        ],
        badLines: 0,
      });
    });

    it('returns 404 for missing night', async () => {
      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request('/api/digest/2026-10-29');
      expect(res.status).toBe(404);
    });

    it('returns empty rows array with 0 bad lines for empty night', async () => {
      const night = '2026-10-27';
      writeFileSync(join(testRunsDir, `${night}.jsonl`), '');

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/api/digest/${night}`);
      expect(res.status).toBe(200);

      const json = (await res.json()) as {
        rows: DigestRow[];
        badLines: number;
      };
      expect(json.rows).toEqual([]);
      expect(json.badLines).toBe(0);
    });

    it('counts bad lines in JSON response', async () => {
      const night = '2026-10-28';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-28T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}\n` +
          `invalid json line\n` +
          `{"at":"2026-10-28T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/api/digest/${night}`);

      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        rows: DigestRow[];
        badLines: number;
      };
      expect(json.badLines).toBe(1);
      expect(json.rows.map((row) => row.job)).toEqual(['lane/sync', 'rig/rotate-logs']);
    });

    it('returns rows sorted by job name', async () => {
      const night = '2026-10-28';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-28T23:00:02+01:00","job":"zebra/job","status":"ok","owner":"lane-07"}\n` +
          `{"at":"2026-10-28T23:00:06+01:00","job":"alpha/job","status":"ok","owner":"rook"}\n` +
          `{"at":"2026-10-28T23:00:10+01:00","job":"middle/job","status":"ok","owner":"rook"}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/api/digest/${night}`);

      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        rows: DigestRow[];
        badLines: number;
      };
      expect(json.rows.map((row) => row.job)).toEqual(['alpha/job', 'middle/job', 'zebra/job']);
    });

    it('aggregates runs and retries for same job', async () => {
      const night = '2026-10-29';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-29T01:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}\n` +
          `{"at":"2026-10-29T01:31:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}\n` +
          `{"at":"2026-10-29T01:33:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}\n` +
          `{"at":"2026-10-29T01:37:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/api/digest/${night}`);

      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        rows: DigestRow[];
        badLines: number;
      };
      const row = json.rows[0];

      expect(row.job).toBe('fixtures/refresh');
      expect(row.runs).toBe(4);
      expect(row.retries).toBe(3);
      expect(row.lastStatus).toBe('ok');
      expect(row.firstAt).toBe('2026-10-29T01:30:00+01:00');
      expect(row.lastAt).toBe('2026-10-29T01:37:00+01:00');
      expect(json.rows).toHaveLength(1);
    });

    it('handles null owner in JSON response', async () => {
      const night = '2026-10-29';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-29T05:41:09+01:00","job":"digest/render","status":"ok","owner":null}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/api/digest/${night}`);

      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        rows: DigestRow[];
        badLines: number;
      };
      expect(json.rows).toHaveLength(1);
      expect(json.rows[0]).toMatchObject({ job: 'digest/render', owner: null });
    });

    it('preserves error messages in JSON response', async () => {
      const night = '2026-10-28';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-28T23:00:02+01:00","job":"test/job","status":"fail","owner":"rook","error":"connection timeout"}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/api/digest/${night}`);

      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        rows: DigestRow[];
        badLines: number;
      };
      expect(json.rows[0].lastError).toBe('connection timeout');
    });

    it('preserves timestamp offsets in JSON response', async () => {
      const night = '2026-10-28';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-28T23:00:02+01:00","job":"test/job","status":"ok","owner":"rook"}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const res = await createApp(config).request(`/api/digest/${night}`);

      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        rows: DigestRow[];
        badLines: number;
      };
      expect(json.rows[0].firstAt).toBe('2026-10-28T23:00:02+01:00');
      expect(json.rows[0].lastAt).toBe('2026-10-28T23:00:02+01:00');
    });

    it('JSON and HTML responses have same rows in same order', async () => {
      const night = '2026-10-29';
      writeFileSync(
        join(testRunsDir, `${night}.jsonl`),
        `{"at":"2026-10-29T01:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}\n` +
          `{"at":"2026-10-29T01:31:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}\n` +
          `{"at":"2026-10-29T01:33:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}\n` +
          `{"at":"2026-10-29T01:37:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}\n` +
          `{"at":"2026-10-29T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}\n` +
          `{"at":"2026-10-29T04:01:00+01:00","job":"Zebra/check","status":"ok","owner":null}\n` +
          `{"at":"2026-10-29T04:02:00+01:00","job":"_internal/check","status":"ok","owner":null}\n`
      );

      const config = { ...baseConfig, runsDir: testRunsDir };
      const htmlRes = await createApp(config).request(`/digest/${night}`);
      const jsonRes = await createApp(config).request(`/api/digest/${night}`);

      expect(htmlRes.status).toBe(200);
      expect(jsonRes.status).toBe(200);

      const html = await htmlRes.text();
      const json = (await jsonRes.json()) as {
        rows: DigestRow[];
        badLines: number;
      };

      const jobs = json.rows.map((row) => row.job);
      expect(jobs).toEqual(['Zebra/check', '_internal/check', 'fixtures/refresh', 'notes/backup']);
      const pageRows = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)]
        .map(([row]) => row)
        .filter((row) => /<td\b/i.test(row));
      expect(pageRows).toHaveLength(jobs.length);
      const pageJobs = pageRows.flatMap((row) => jobs.filter((job) => row.includes(job)));
      expect(pageJobs).toEqual(jobs);
    });
  });
});
