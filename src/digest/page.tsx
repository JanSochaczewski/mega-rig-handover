import type { Hono } from 'hono';
import { lane } from '../lane.js';
import { Layout } from '../views/layout.js';
import { Digest } from '../views/digest.js';
import type { RigConfig } from '../config.js';
import type { ReadNight } from './types.js';

export function registerDigestPage(app: Hono, config: RigConfig, readNight: ReadNight) {
  app.get('/digest/:night', (context) => {
    const night = context.req.param('night');
    const digest = readNight(config.runsDir, night);

    if (digest === null) {
      return context.notFound();
    }

    return context.html(
      <Layout title="digest" lane={lane()}>
        <Digest night={night} digest={digest} />
      </Layout>,
    );
  });
}
