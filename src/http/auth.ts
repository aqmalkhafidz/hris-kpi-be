import { createMiddleware } from 'hono/factory';
import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '../types.js';
import { fail } from './error.js';

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-me'
);

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

export async function signToken(user: AuthUser) {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, secret);
  const user = payload.user as AuthUser | undefined;
  if (!user?.id) fail(401, 'Invalid token');
  return user;
}

export const authMiddleware = createMiddleware<{
  Variables: { authUser: AuthUser };
}>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ')
    ? header.slice('Bearer '.length)
    : null;
  if (!token) fail(401, 'Missing bearer token');
  try {
    c.set('authUser', await verifyToken(token));
    await next();
  } catch {
    fail(401, 'Invalid token');
  }
});

export function toAuthUser(
  user: { id: number; email: string; name: string },
  role: string
): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: role as UserRole,
  };
}
