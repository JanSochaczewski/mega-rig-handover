import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readStatus } from '../src/status.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };
const tempDirs: string[] = [];

function makeRunsDir() {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-board-'));
  tempDirs.push(runsDir);
  return runsDir;
}

afterEach(() => {
  for (const runsDir of tempDirs.splice(0)) {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

describe('digest links on the status board', () => {
  it('links every night newest first with raw event counts beside the link', async () => {
    const runsDir = makeRunsDir();
    const entries = [
      { job: 'same-job', status: 'retry', owner: null },
      { job: 'same-job', status: 'retry', owner: null },
      { job: 'same-job', status: 'ok', owner: null },
      { job: 'other-job', status: 'ok', owner: 'reader' },
      { job: 'failed-job', status: 'fail', owner: 'reader' },
      { status: 'unknown' },
      { status: { ok: true } },
      {},
      null,
      42,
      'ok',
    ];
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), entries.map((entry) => JSON.stringify(entry)).join('\r\n') + '\r\nnot json\r\n\r\n');
    writeFileSync(join(runsDir, '2026-10-27.jsonl'), '{"status":"fail"}\n');
    writeFileSync(join(runsDir, '2026-10-29.jsonl'), '');
    writeFileSync(join(runsDir, 'notes.jsonl'), '{"status":"ok"}\n');
    writeFileSync(join(runsDir, '2026-10-30.txt'), '{"status":"ok"}\n');

    const status = readStatus({ ...config, runsDir });
    expect(status.nights).toEqual(['2026-10-29', '2026-10-28', '2026-10-27']);
    expect(status.nightCounts).toEqual({
      '2026-10-29': { ok: 0, retry: 0, fail: 0 },
      '2026-10-28': { ok: 2, retry: 2, fail: 1 },
      '2026-10-27': { ok: 0, retry: 0, fail: 1 },
    });

    const response = await createApp({ ...config, runsDir }).request('/');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html.match(/<li>.*?<\/li>/g)).toEqual([
      '<li><a href="/digest/2026-10-29">2026-10-29</a> <span class="mute">0 ok \u00b7 0 retry \u00b7 0 fail</span></li>',
      '<li><a href="/digest/2026-10-28">2026-10-28</a> <span class="mute">2 ok \u00b7 2 retry \u00b7 1 fail</span></li>',
      '<li><a href="/digest/2026-10-27">2026-10-27</a> <span class="mute">0 ok \u00b7 0 retry \u00b7 1 fail</span></li>',
    ]);
    expect(html).not.toContain('<script');
  });

  it.each(['empty', 'missing'])('renders the empty board for an %s runs directory', async (kind) => {
    const tempDir = makeRunsDir();
    const runsDir = kind === 'missing' ? join(tempDir, 'missing') : tempDir;
    expect(readStatus({ ...config, runsDir }).nightCounts).toEqual({});

    const response = await createApp({ ...config, runsDir }).request('/');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('nothing in runs/');
    expect(html).not.toContain('href="/digest/');
  });
});