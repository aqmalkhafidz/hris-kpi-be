import { serve } from '@hono/node-server';
import app from './app.js';
import { log } from './log.js';

const port = Number(process.env.PORT ?? 4000);

serve({ fetch: app.fetch, port }, (info) => {
  log.info('Performa API listening', { port: info.port });
});
