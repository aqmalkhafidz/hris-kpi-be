import type { Hono } from 'hono';
import type { AuthUser } from './auth.js';

export type AppEnv = { Variables: { authUser: AuthUser } };
export type AppHono = Hono<AppEnv>;
