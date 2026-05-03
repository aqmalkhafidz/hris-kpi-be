import type { Context } from 'hono';
import { log } from '../log.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

export function jsonError(c: Context, error: unknown) {
  if (error instanceof HttpError) {
    return c.json({ error: error.message }, error.status as never);
  }
  const msg = error instanceof Error ? error.message : 'Unknown error';
  const stack = error instanceof Error ? error.stack : undefined;
  log.error('unhandled error', {
    path: c.req.path,
    method: c.req.method,
    error: msg,
    stack,
  });
  return c.json({ error: 'Internal server error' }, 500);
}
