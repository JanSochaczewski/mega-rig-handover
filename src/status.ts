import { readdirSync, readFileSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightCounts = {
  ok: number;
  retry: number;
  fail: number;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: string[];
  nightCounts: Record<string, NightCounts>;
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function countNightStatuses(runsDir: string, night: string): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  const filePath = runsDir + '/' + night + '.jsonl';

  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      try {
        const entry: unknown = JSON.parse(line);
        if (typeof entry !== 'object' || entry === null || !('status' in entry)) continue;
        const status = entry.status;
        if (status === 'ok' || status === 'retry' || status === 'fail') {
          counts[status]++;
        }
      } catch {
        // Ignore unparseable lines
      }
    }
  } catch {
    // Return zero counts if file does not exist or cannot be read
  }

  return counts;
}

export function readStatus(config: RigConfig): Status {
  const nights = nightsOnDisk(config.runsDir);
  const nightCounts: Record<string, NightCounts> = {};

  for (const night of nights) {
    nightCounts[night] = countNightStatuses(config.runsDir, night);
  }

  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
    nightCounts,
  };
}
