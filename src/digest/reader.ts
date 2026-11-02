import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight } from './types.js';

type RunRecord = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) return false;
  if (!('at' in value) || typeof value.at !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.at)) return false;
  if (!Number.isFinite(Date.parse(value.at))) return false;
  if (!('job' in value) || typeof value.job !== 'string' || value.job.trim() === '') return false;
  if (!('status' in value) || (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail')) return false;
  if (!('owner' in value) || (value.owner !== null && typeof value.owner !== 'string')) return false;
  return !('error' in value) || typeof value.error === 'string';
}

export const readNight: ReadNight = (runsDir, night) => {
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  for (const line of lines) {
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      badLines += 1;
      continue;
    }
    if (!isRunRecord(record)) {
      badLines += 1;
      continue;
    }

    const row = rows.get(record.job);
    if (!row) {
      rows.set(record.job, {
        job: record.job,
        owner: record.owner,
        runs: 1,
        retries: record.status === 'retry' ? 1 : 0,
        lastStatus: record.status,
        lastError: record.error ?? null,
        firstAt: record.at,
        lastAt: record.at,
      });
      continue;
    }

    row.runs += 1;
    row.retries += record.status === 'retry' ? 1 : 0;
    row.owner = record.owner;
    row.lastStatus = record.status;
    row.lastError = record.error ?? null;
    if (Date.parse(record.at) < Date.parse(row.firstAt)) row.firstAt = record.at;
    if (Date.parse(record.at) > Date.parse(row.lastAt)) row.lastAt = record.at;
  }

  return {
    rows: [...rows.values()].sort((left, right) => left.job < right.job ? -1 : left.job > right.job ? 1 : 0),
    badLines,
  };
};