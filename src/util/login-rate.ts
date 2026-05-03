import { LOGIN_MAX_FAILS, LOGIN_WINDOW_MS } from '../config.js';
import { fail } from '../http/error.js';

// In-memory sliding-window rate limit for /auth/login. Single-process only;
// swap for Redis if scaling horizontally.
const loginAttempts = new Map<string, number[]>();

export function loginRateKey(
  c: { req: { header: (n: string) => string | undefined } },
  email: string
) {
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown';
  return `${ip}|${email.toLowerCase()}`;
}

export function checkLoginRate(key: string): void {
  const now = Date.now();
  const cutoff = now - LOGIN_WINDOW_MS;
  const arr = (loginAttempts.get(key) ?? []).filter((t) => t > cutoff);
  if (arr.length >= LOGIN_MAX_FAILS)
    fail(429, 'Too many failed attempts. Try again later.');
  loginAttempts.set(key, arr);
}

export function recordLoginFailure(key: string): void {
  const arr = loginAttempts.get(key) ?? [];
  arr.push(Date.now());
  loginAttempts.set(key, arr);
}

export function clearLoginFailures(key: string): void {
  loginAttempts.delete(key);
}
