import { fail } from '../http/error.js';

export function numberParam(value: string, label = 'id') {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(400, `Invalid ${label}`);
  return parsed;
}
