import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { registerDigestPage } from '../src/digest/page.js';
import type { DigestNight, ReadNight } from '../src/digest/types.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('digest page', () => {
  it('renders rows sorted by job', async () => {
    const mockDigest: DigestNight = {
      rows: [
        {
          job: 'zebra/task',
          owner: 'alice',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T01:00:00+01:00',
          lastAt: '2026-10-29T01:00:00+01:00',
        },
        {
          job: 'alpha/task',
          owner: 'bob',
          runs: 3,
          retries: 2,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T00:00:00+01:00',
          lastAt: '2026-10-29T03:00:00+01:00',
        },
      ],
      badLines: 0,
    };

    const readNight = vi.fn().mockReturnValue(mockDigest);
    const app = new Hono();
    registerDigestPage(app, config, readNight as ReadNight);

    const res = await app.request('/digest/2026-10-29');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('digest');
    expect(html).toContain('alpha/task');
    expect(html).toContain('zebra/task');
    const alphaPos = html.indexOf('alpha/task');
    const zebraPos = html.indexOf('zebra/task');
    expect(alphaPos).toBeLessThan(zebraPos);
    expect(readNight).toHaveBeenCalledExactlyOnceWith(config.runsDir, '2026-10-29');
    expect(mockDigest.rows.map((row) => row.job)).toEqual(['zebra/task', 'alpha/task']);
    expect(html).toContain('<header>');
    expect(html).toContain('<strong>rig</strong>');
    expect(html).toContain('<span class="marker">');
    expect(html).not.toContain('<script');
  });

  it.each(['ok', 'fail'] as const)('marks retries >= 3 while preserving %s status', async (lastStatus) => {
    const mockDigest: DigestNight = {
      rows: [
        {
          job: 'test/task',
          owner: 'alice',
          runs: 5,
          retries: 3,
          lastStatus,
          lastError: null,
          firstAt: '2026-10-29T00:00:00+01:00',
          lastAt: '2026-10-29T03:00:00+01:00',
        },
      ],
      badLines: 0,
    };

    const readNight = vi.fn().mockReturnValue(mockDigest);
    const app = new Hono();
    registerDigestPage(app, config, readNight as ReadNight);

    const res = await app.request('/digest/2026-10-29');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<span class="warn">3 (high retry count)</span>');
    expect(html).toContain(`>${lastStatus}</span>`);
    if (lastStatus === 'fail') {
      expect(html).toContain('<span class="warn">fail</span>');
    }
  });

  it('marks failed status with accessible text', async () => {
    const mockDigest: DigestNight = {
      rows: [
        {
          job: 'test/task',
          owner: 'alice',
          runs: 2,
          retries: 1,
          lastStatus: 'fail',
          lastError: 'something broke',
          firstAt: '2026-10-29T00:00:00+01:00',
          lastAt: '2026-10-29T02:00:00+01:00',
        },
      ],
      badLines: 0,
    };

    const readNight = vi.fn().mockReturnValue(mockDigest);
    const app = new Hono();
    registerDigestPage(app, config, readNight as ReadNight);

    const res = await app.request('/digest/2026-10-29');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<span class="warn">fail</span>');
    expect(html).not.toContain('high retry count');
    expect(html).toContain('something broke');
  });

  it('shows em dash for null values', async () => {
    const mockDigest: DigestNight = {
      rows: [
        {
          job: 'test/task',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T00:00:00+01:00',
          lastAt: '2026-10-29T00:00:00+01:00',
        },
      ],
      badLines: 0,
    };

    const readNight = vi.fn().mockReturnValue(mockDigest);
    const app = new Hono();
    registerDigestPage(app, config, readNight as ReadNight);

    const res = await app.request('/digest/2026-10-29');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html.match(/<span class="mute">—<\/span>/g)).toHaveLength(2);
  });

  it('returns 404 for missing night file', async () => {
    const readNight = vi.fn().mockReturnValue(null);
    const app = new Hono();
    registerDigestPage(app, config, readNight as ReadNight);

    const res = await app.request('/digest/2026-10-99');

    expect(res.status).toBe(404);
  });

  it('renders nothing ran for empty night', async () => {
    const mockDigest: DigestNight = {
      rows: [],
      badLines: 0,
    };

    const readNight = vi.fn().mockReturnValue(mockDigest);
    const app = new Hono();
    registerDigestPage(app, config, readNight as ReadNight);

    const res = await app.request('/digest/2026-10-29');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('shows bad line count', async () => {
    const mockDigest: DigestNight = {
      rows: [
        {
          job: 'test/task',
          owner: 'alice',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T00:00:00+01:00',
          lastAt: '2026-10-29T00:00:00+01:00',
        },
      ],
      badLines: 2,
    };

    const readNight = vi.fn().mockReturnValue(mockDigest);
    const app = new Hono();
    registerDigestPage(app, config, readNight as ReadNight);

    const res = await app.request('/digest/2026-10-29');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('2 malformed lines');
  });

  it('preserves timestamp strings', async () => {
    const timestamp = '2026-10-29T12:34:56+02:00';
    const mockDigest: DigestNight = {
      rows: [
        {
          job: 'test/task',
          owner: 'alice',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: timestamp,
          lastAt: timestamp,
        },
      ],
      badLines: 0,
    };

    const readNight = vi.fn().mockReturnValue(mockDigest);
    const app = new Hono();
    registerDigestPage(app, config, readNight as ReadNight);

    const res = await app.request('/digest/2026-10-29');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain(timestamp);
  });
});
