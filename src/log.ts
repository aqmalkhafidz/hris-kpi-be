// Minimal structured logger. JSON lines in prod, plaintext in dev.
import { IS_PROD } from './config.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  if (IS_PROD) {
    const line = JSON.stringify({ ts, level, msg, ...fields });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }
  const tag = `[${ts}] ${level.toUpperCase()}`;
  if (fields && Object.keys(fields).length)
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      `${tag} ${msg}`,
      fields
    );
  else
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      `${tag} ${msg}`
    );
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) =>
    emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) =>
    emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) =>
    emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) =>
    emit('error', msg, fields),
};
