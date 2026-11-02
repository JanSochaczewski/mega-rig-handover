import { type Hono } from 'hono';
import type { RigConfig } from '../config.js';
import type { DigestNight, ReadNight } from './types.js';

export function registerDigestApi(
  app: Hono,
  config: RigConfig,
  readNight: ReadNight,
): void {
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');

    const result = readNight(config.runsDir, night);

    if (result === null) {
      return c.json({ error: 'Not found' }, 404);
    }

    const response: DigestNight = result;
    return c.json(response);
  });
}
