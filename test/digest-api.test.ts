import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { registerDigestApi } from '../src/digest/api.js';
import type { DigestNight, ReadNight } from '../src/digest/types.js';
import type { RigConfig } from '../src/config.js';

describe('digest api', () => {
  const config: RigConfig = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: 'runs',
  };

  it('returns 404 for missing night', async () => {
    const mockReadNight: ReadNight = vi.fn(() => null);
    const app = new Hono();
    registerDigestApi(app, config, mockReadNight);

    const res = await app.request('/api/digest/2026-11-01');
    expect(res.status).toBe(404);
    expect(mockReadNight).toHaveBeenCalledWith('runs', '2026-11-01');
  });

  it('returns 200 with empty rows for night with no runs', async () => {
    const mockReadNight: ReadNight = vi.fn(
      (): DigestNight => ({ rows: [], badLines: 0 }),
    );
    const app = new Hono();
    registerDigestApi(app, config, mockReadNight);

    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('returns digest rows sorted by job', async () => {
    const mockReadNight: ReadNight = vi.fn(
      (): DigestNight => ({
        rows: [
          {
            job: 'fixtures/refresh',
            owner: 'rook',
            runs: 4,
            retries: 3,
            lastStatus: 'ok',
            lastError: null,
            firstAt: '2026-10-29T01:30:00+01:00',
            lastAt: '2026-10-29T01:37:00+01:00',
          },
          {
            job: 'lane/sync',
            owner: 'rook',
            runs: 8,
            retries: 1,
            lastStatus: 'ok',
            lastError: null,
            firstAt: '2026-10-28T23:00:06+01:00',
            lastAt: '2026-10-29T05:00:04+01:00',
          },
        ],
        badLines: 0,
      }),
    );
    const app = new Hono();
    registerDigestApi(app, config, mockReadNight);

    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].job).toBe('fixtures/refresh');
    expect(body.rows[1].job).toBe('lane/sync');
  });

  it('preserves null owner as null', async () => {
    const mockReadNight: ReadNight = vi.fn(
      (): DigestNight => ({
        rows: [
          {
            job: 'digest/render',
            owner: null,
            runs: 1,
            retries: 0,
            lastStatus: 'ok',
            lastError: null,
            firstAt: '2026-10-29T05:41:09+01:00',
            lastAt: '2026-10-29T05:41:09+01:00',
          },
        ],
        badLines: 0,
      }),
    );
    const app = new Hono();
    registerDigestApi(app, config, mockReadNight);

    const res = await app.request('/api/digest/2026-10-29');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.rows[0].owner).toBeNull();
  });

  it('includes bad lines count', async () => {
    const mockReadNight: ReadNight = vi.fn(
      (): DigestNight => ({
        rows: [
          {
            job: 'test/job',
            owner: 'rook',
            runs: 1,
            retries: 0,
            lastStatus: 'ok',
            lastError: null,
            firstAt: '2026-10-28T23:00:00+01:00',
            lastAt: '2026-10-28T23:00:00+01:00',
          },
        ],
        badLines: 1,
      }),
    );
    const app = new Hono();
    registerDigestApi(app, config, mockReadNight);

    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.badLines).toBe(1);
  });
});
