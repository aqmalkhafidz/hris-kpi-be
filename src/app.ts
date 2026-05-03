import 'dotenv/config';
import path from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { CORS_MAX_AGE, IS_PROD } from './config.js';
import type { AppEnv } from './http/env.js';
import { jsonError } from './http/error.js';
import { registerAppraisalRoutes } from './http/routes/appraisals.js';
import { registerAuthRoutes } from './http/routes/auth.js';
import { registerCycleRoutes } from './http/routes/cycles.js';
import { registerDashboardRoutes } from './http/routes/dashboard.js';
import { registerKraTemplateRoutes } from './http/routes/kra-templates.js';
import { registerOrgRoutes } from './http/routes/org.js';
import { registerReportsAndAuditRoutes } from './http/routes/reports-audit.js';
import { registerUploadRoutes } from './http/routes/uploads.js';

const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';
const uploadRoot = path.resolve(process.cwd(), uploadDir);

const app = new Hono<AppEnv>();

app.onError((error, c) => jsonError(c, error));

app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      imgSrc: ["'self'", 'data:'],
    },
    referrerPolicy: 'no-referrer',
    crossOriginResourcePolicy: 'same-site',
    xFrameOptions: 'DENY',
    strictTransportSecurity: IS_PROD
      ? 'max-age=31536000; includeSubDomains'
      : false,
  })
);

app.use(
  '*',
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: CORS_MAX_AGE,
  })
);

app.get('/health', (c) => c.json({ ok: true }));

// Order matters: uploads registers /uploads/* middleware + serveStatic first
// so its auth wrapper precedes any other handler matching the same path.
registerUploadRoutes(app, uploadRoot);
registerAuthRoutes(app, uploadRoot);
registerAppraisalRoutes(app);
registerOrgRoutes(app);
registerCycleRoutes(app);
registerKraTemplateRoutes(app);
registerReportsAndAuditRoutes(app);
registerDashboardRoutes(app);

export default app;
