import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const directories: string[] = [];
const night = '2026-10-28';
const record = {
  at: '2026-10-28T23:00:02+01:00',
  job: 'lane/sync',
  status: 'ok',
  owner: 'rook',
};

function runsDirectory(contents?: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  directories.push(directory);
  if (contents !== undefined) writeFileSync(join(directory, `${night}.jsonl`), contents);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads the real sample without modifying it', () => {
    const digest = readNight('runs', night);
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows.find((row) => row.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
      lastStatus: 'ok', lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(digest?.rows.find((row) => row.job === 'lane/sync')?.runs).toBe(8);
    expect(digest?.rows.find((row) => row.job === 'digest/render')?.owner).toBeNull();
    expect(digest?.rows.find((row) => row.job === 'notes/backup')?.lastError).toBe('quota exceeded');
  });

  it('distinguishes a missing file from an empty file', () => {
    expect(readNight(runsDirectory(), night)).toBeNull();
    expect(readNight(runsDirectory(''), night)).toEqual({ rows: [], badLines: 0 });
  });

  it('counts runs and retries and takes metadata from the last valid record', () => {
    const records = [
      { ...record, status: 'retry', error: 'lock held' },
      { ...record, status: 'fail', owner: null, error: 'quota exceeded' },
      { ...record, status: 'retry', owner: 'replacement' },
    ];
    const directory = runsDirectory(records.map((entry) => JSON.stringify(entry)).join('\r\n') + '\r\n');
    expect(readNight(directory, night)).toEqual({
      rows: [{ job: record.job, owner: 'replacement', runs: 3, retries: 2,
        lastStatus: 'retry', lastError: null, firstAt: record.at, lastAt: record.at }],
      badLines: 0,
    });
  });

  it('compares timestamp instants while retaining original offsets and file-order metadata', () => {
    const records = [
      { ...record, at: '2026-10-29T01:00:00+02:00' },
      { ...record, at: '2026-10-29T00:30:00Z' },
      { ...record, at: '2026-10-29T00:00:00+02:00', status: 'fail', owner: null, error: 'last record' },
    ];
    const directory = runsDirectory(records.map((entry) => JSON.stringify(entry)).join('\n'));
    expect(readNight(directory, night)?.rows[0]).toEqual({
      job: record.job, owner: null, runs: 3, retries: 0, lastStatus: 'fail', lastError: 'last record',
      firstAt: records[2].at, lastAt: records[1].at,
    });
  });

  it('counts malformed JSON and invalid schemas without losing valid records', () => {
    const invalid = [
      null, [], 42, 'text', {},
      { ...record, at: 123 }, { ...record, at: 'not a time' }, { ...record, at: '2026-10-28' },
      { ...record, job: null }, { ...record, job: ' ' },
      { ...record, status: 'pending' }, { ...record, status: ['ok'] },
      { ...record, owner: 42 }, { ...record, owner: undefined },
      { ...record, error: null }, { ...record, error: 42 },
    ];
    const directory = runsDirectory([
      JSON.stringify(record), '{broken', '', ...invalid.map((entry) => JSON.stringify(entry)),
      JSON.stringify({ ...record, owner: null }),
    ].join('\n'));
    expect(readNight(directory, night)).toEqual({
      rows: [{ job: record.job, owner: null, runs: 2, retries: 0,
        lastStatus: 'ok', lastError: null, firstAt: record.at, lastAt: record.at }],
      badLines: invalid.length + 2,
    });
  });

  it('sorts jobs deterministically and handles object-property names safely', () => {
    const jobs = ['z', '__proto__', 'a', 'constructor', 'A'];
    const directory = runsDirectory(jobs.map((job) => JSON.stringify({ ...record, job })).join('\n'));
    expect(readNight(directory, night)?.rows.map((row) => row.job)).toEqual([
      'A', '__proto__', 'a', 'constructor', 'z',
    ]);
  });

  it('rejects traversal and non-night names', () => {
    const directory = runsDirectory(JSON.stringify(record));
    for (const invalid of ['../2026-10-28', '..\\2026-10-28', '/2026-10-28', `${night}.jsonl`, `${night}\n`]) {
      expect(readNight(directory, invalid)).toBeNull();
    }
  });
});