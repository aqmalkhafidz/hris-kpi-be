import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { errors as joseErrors, SignJWT, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';
import { IS_PROD, JWT_EXPIRY } from '../config.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { log } from '../log.js';
import type { UserRole } from '../types.js';
import { fail } from './error.js';

const AUTH_COOKIE_NAME = 'hris_auth';
const CSRF_COOKIE_NAME = 'hris_csrf';
export const CSRF_HEADER_NAME = 'X-CSRF-Token';

const rawSecret = process.env.JWT_SECRET;
if (!rawSecret || rawSecret.length < 32) {
  if (IS_PROD) {
    throw new Error(
      'JWT_SECRET must be set and at least 32 characters in production'
    );
  }
  if (!rawSecret) {
    log.warn(
      'JWT_SECRET is not set — using dev-only fallback. DO NOT use in production.'
    );
  } else {
    log.warn('JWT_SECRET is too short — use ≥32 chars', {
      length: rawSecret.length,
    });
  }
}
const secret = new TextEncoder().encode(
  rawSecret ?? 'dev-secret-change-me-32-chars-min'
);

const authCookieOptions = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? ('None' as const) : ('Lax' as const),
  path: '/',
};

const csrfCookieOptions = {
  httpOnly: false,
  secure: IS_PROD,
  sameSite: IS_PROD ? ('None' as const) : ('Lax' as const),
  path: '/',
};

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

interface JwtPayloadShape {
  user: AuthUser;
  tv: number;
}

export async function signToken(user: AuthUser, tokenVersion: number) {
  return new SignJWT({ user, tv: tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(secret);
}

export function setAuthCookie(c: Context, token: string) {
  setCookie(c, AUTH_COOKIE_NAME, token, authCookieOptions);
}

export function clearAuthCookies(c: Context) {
  deleteCookie(c, AUTH_COOKIE_NAME, { path: '/' });
  deleteCookie(c, CSRF_COOKIE_NAME, { path: '/' });
}

export function issueCsrfToken(c: Context) {
  const token = nanoid(32);
  setCookie(c, CSRF_COOKIE_NAME, token, csrfCookieOptions);
  return token;
}

export const csrfMiddleware = createMiddleware(async (c, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    await next();
    return;
  }

  const cookieToken = getCookie(c, CSRF_COOKIE_NAME);
  const headerToken = c.req.header(CSRF_HEADER_NAME);
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    fail(403, 'Invalid CSRF token');
  }

  await next();
});

export async function verifyToken(
  token: string
): Promise<{ user: AuthUser; tv: number }> {
  const { payload } = await jwtVerify(token, secret);
  const { user, tv } = payload as Partial<JwtPayloadShape>;
  if (!user?.id || typeof tv !== 'number') fail(401, 'Invalid token');
  return { user, tv };
}

export const authMiddleware = createMiddleware<{
  Variables: { authUser: AuthUser };
}>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ')
    ? header.slice('Bearer '.length)
    : getCookie(c, AUTH_COOKIE_NAME);
  if (!token) fail(401, 'Missing auth token');
  let claims: { user: AuthUser; tv: number };
  try {
    claims = await verifyToken(token);
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) fail(401, 'Token expired');
    if (
      err instanceof joseErrors.JWTInvalid ||
      err instanceof joseErrors.JWSInvalid ||
      err instanceof joseErrors.JWSSignatureVerificationFailed
    )
      fail(401, 'Invalid token');
    fail(401, 'Authentication failed');
  }
  // Reject tokens issued before the latest password change.
  const [row] = await db
    .select({ tokenVersion: users.tokenVersion })
    .from(users)
    .where(eq(users.id, claims.user.id));
  if (!row) fail(401, 'User no longer exists');
  if (row.tokenVersion !== claims.tv) fail(401, 'Token revoked');
  c.set('authUser', claims.user);
  await next();
});

export function toAuthUser(
  user: { id: number; email: string; name: string },
  role: string
): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: role.toLowerCase() as UserRole,
  };
}

export function requireRole(authUser: AuthUser, ...allowed: UserRole[]): void {
  if (!allowed.includes(authUser.role))
    fail(403, `Requires role: ${allowed.join('|')}`);
}

export interface AppraisalAccessRow {
  userId: number;
  reviewerSlUserId: number | null;
  reviewerHodUserId: number | null;
  reviewerHodivUserId: number | null;
}

export function canAccessAppraisal(
  authUser: AuthUser,
  row: AppraisalAccessRow
): boolean {
  if (authUser.role === 'hr') return true;
  if (row.userId === authUser.id) return true;
  if (authUser.role === 'sl' && row.reviewerSlUserId === authUser.id)
    return true;
  if (authUser.role === 'hodept' && row.reviewerHodUserId === authUser.id)
    return true;
  if (authUser.role === 'hodiv' && row.reviewerHodivUserId === authUser.id)
    return true;
  return false;
}

export function requireAppraisalAccess(
  authUser: AuthUser,
  row: AppraisalAccessRow
): void {
  if (!canAccessAppraisal(authUser, row)) fail(403, 'Forbidden');
}
