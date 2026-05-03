// Tunables. Pull from env when present; otherwise sensible defaults.

const num = (key: string, fallback: number) => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const PASSWORD_MIN_LEN = num('PASSWORD_MIN_LEN', 10);
export const BCRYPT_ROUNDS = num('BCRYPT_ROUNDS', 12);

export const JWT_EXPIRY = process.env.JWT_EXPIRY ?? '8h';

export const LOGIN_WINDOW_MS = num('LOGIN_WINDOW_MS', 15 * 60 * 1000);
export const LOGIN_MAX_FAILS = num('LOGIN_MAX_FAILS', 5);

export const AVATAR_MAX_BYTES = num('AVATAR_MAX_BYTES', 2 * 1024 * 1024);
export const UPLOAD_MAX_BYTES = num('UPLOAD_MAX_BYTES', 10 * 1024 * 1024);

export const STUCK_REVIEW_MS = num('STUCK_REVIEW_MS', 5 * 24 * 60 * 60 * 1000);

export const CORS_MAX_AGE = num('CORS_MAX_AGE', 600);

export const IS_PROD = process.env.NODE_ENV === 'production';
