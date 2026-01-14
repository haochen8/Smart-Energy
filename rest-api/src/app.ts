import express, { Response } from 'express';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { TimescaleClient } from './db';
import { openApiSpec } from './openapi';
import { PredictionDependencyError, PredictionService, PredictionValidationError } from './predictionService';
import {
  AlgorithmProcessorClient,
  AlgorithmProcessorHttpError,
  AlgorithmProcessorTimeoutError,
} from './algorithmProcessorClient';
import { parseArea, parseDateValue, parseLimitValue, parseSeriesId } from './requestUtils';

const corsAllowAll = config.corsOrigins.includes('*');
const corsOrigins = new Set(config.corsOrigins.filter((origin) => origin !== '*'));

function respondError(res: Response, status: number, message: string, details?: unknown) {
  return res.status(status).json({ error: message, details });
}

type AppServices = {
  predictionClient?: AlgorithmProcessorClient | null;
  predictionService?: PredictionService | null;
};

const UI_TOKEN_COOKIE = 'dt_ui_token';
const UI_JWT_TTL_SECONDS = 60 * 60 * 24 * 7;

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [key, ...valueParts] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(valueParts.join('='));
    return acc;
  }, {});
}

function getUiToken(req: express.Request): string | null {
  const authHeader = req.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[UI_TOKEN_COOKIE] || null;
}

function isUiTokenValid(token: string | null): boolean {
  if (!token || !config.uiJwtSecret) return false;
  try {
    jwt.verify(token, config.uiJwtSecret);
    return true;
  } catch {
    return false;
  }
}

function buildUiCookie(token: string, req: express.Request): string {
  const secure = req.secure ? '; Secure' : '';
  return `${UI_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=${UI_JWT_TTL_SECONDS}; SameSite=Lax${secure}`;
}

export function createApp(db: TimescaleClient | null, services: AppServices = {}) {
  const predictionClient = services.predictionClient ?? null;
  const predictionService =
    services.predictionService ??
    (predictionClient ? new PredictionService(predictionClient, db, config.maxHistoryLimit) : null);
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    res.setHeader('X-Request-Id', requestId);
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'request',
          request_id: requestId,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          duration_ms: Math.round(durationMs),
          client_ip: req.ip,
          user_agent: req.headers['user-agent'] ?? null,
        }),
      );
    });
    next();
  });

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (corsAllowAll || corsOrigins.has(origin))) {
      res.setHeader('Access-Control-Allow-Origin', corsAllowAll ? '*' : origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Request-Id');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use((req, res, next) => {
    if (req.path === '/health') return next();
    if (req.path === '/openapi.json') return next();
    if (req.path === '/docs' || req.path.startsWith('/docs/')) return next();
    if (req.path === '/ui' || req.path.startsWith('/ui/')) return next();
    if (!config.apiKey) return respondError(res, 500, 'API key not configured');
    const uiToken = getUiToken(req);
    if (isUiTokenValid(uiToken)) return next();
    const apiKey = req.get('X-API-Key');
    if (!apiKey) return respondError(res, 401, 'Missing API key');
    if (apiKey !== config.apiKey) return respondError(res, 403, 'Invalid API key');
    return next();
  });

  app.get('/', (_req, res) => {
    res.json({
      service: 'digital-twin-rest-api',
      version: '1.0.0',
      endpoints: {
        health: { url: '/health', method: 'GET' },
        openapi: { url: '/openapi.json', method: 'GET' },
        docs: { url: '/docs', method: 'GET' },
        ui: { url: '/ui', method: 'GET' },
        meta: { url: '/v1/meta', method: 'GET' },
        predict: { url: '/v1/predict', method: 'POST' },
        predict_spot_price: { url: '/v1/predict/spot-price', method: 'POST' },
        areas: { url: '/v1/areas', method: 'GET' },
        state_latest: { url: '/v1/state/latest', method: 'GET' },
        area_latest: { url: '/v1/area/latest', method: 'GET' },
        state_history: { url: '/v1/state/history', method: 'GET' },
        decisions_history: { url: '/v1/decisions/history', method: 'GET' },

      },
    });
  });

  app.get('/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    }),
  );

  const publicDir = path.join(process.cwd(), 'public');
  const uiAuthEnabled = Boolean(config.uiJwtSecret);
  const uiBypassPaths = new Set(['/login', '/login.js', '/login.css', '/validate']);

  const uiAuthMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!uiAuthEnabled) return next();
    if (uiBypassPaths.has(req.path)) return next();
    const token = getUiToken(req);
    if (!isUiTokenValid(token)) {
      return res.redirect('/ui/login');
    }
    return next();
  };

  app.get('/ui/login', (_req, res) => {
    res.sendFile(path.join(publicDir, 'login.html'));
  });
  app.post('/ui/login', (req, res) => {
    if (!uiAuthEnabled) return respondError(res, 400, 'UI auth is disabled');
    if (!config.uiAuthUsername || !config.uiAuthPassword) {
      return respondError(res, 500, 'UI credentials not configured');
    }
    const { username, password } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof username !== 'string' || typeof password !== 'string') {
      return respondError(res, 400, 'Username and password are required');
    }
    if (username !== config.uiAuthUsername || password !== config.uiAuthPassword) {
      return respondError(res, 401, 'Invalid credentials');
    }
    const token = jwt.sign({ sub: username }, config.uiJwtSecret, { expiresIn: UI_JWT_TTL_SECONDS });
    res.setHeader('Set-Cookie', buildUiCookie(token, req));
    return res.json({ status: 'ok' });
  });
  app.get('/ui/login.js', (_req, res) => {
    res.sendFile(path.join(publicDir, 'login.js'));
  });
  app.get('/ui/login.css', (_req, res) => {
    res.sendFile(path.join(publicDir, 'login.css'));
  });
  app.get('/ui/validate', (req, res) => {
    if (!uiAuthEnabled) return res.json({ status: 'disabled' });
    const token = getUiToken(req);
    if (!isUiTokenValid(token)) return res.status(401).json({ status: 'invalid' });
    return res.json({ status: 'valid' });
  });
  app.get('/ui/logout', (req, res) => {
    const secure = req.secure ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${UI_TOKEN_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax${secure}`);
    res.redirect('/ui/login');
  });
  app.get('/ui', uiAuthMiddleware, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
  app.use('/ui', uiAuthMiddleware, express.static(publicDir));

  app.get('/health', async (_req, res) => {
    if (!db) {
      return res.status(503).json({
        status: 'unhealthy',
        db_status: 'disabled',
        timestamp: new Date().toISOString(),
      });
    }
    const dbConnected = await db.ping();
    return res.status(dbConnected ? 200 : 503).json({
      status: dbConnected ? 'healthy' : 'degraded',
      db_status: dbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/v1/meta', (_req, res) => {
    res.json({
      service: 'digital-twin-rest-api',
      version: '1.0.0',
      environment: config.env,
      timescale_enabled: config.timescaleEnabled,
      max_history_limit: config.maxHistoryLimit,
      cors_origins: config.corsOrigins,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/v1/predict', async (req, res) => {
    if (!predictionService) return respondError(res, 503, 'Prediction service not configured');
    const payload = (req.body ?? {}) as Record<string, unknown>;

    try {
      const result = await predictionService.predict(payload);
      return res.json(result);
    } catch (err: any) {
      if (err instanceof PredictionValidationError) {
        return respondError(res, 400, err.message, err.details);
      }
      if (err instanceof PredictionDependencyError) {
        return respondError(res, 502, err.message, err.details);
      }
      if (err instanceof AlgorithmProcessorHttpError) {
        return respondError(res, err.status, 'Algorithm processor error', err.body);
      }
      if (err instanceof AlgorithmProcessorTimeoutError) {
        return respondError(res, 504, err.message);
      }
      return respondError(res, 502, 'Failed to reach algorithm processor');
    }
  });

  app.post('/v1/predict/spot-price', async (req, res) => {
    if (!predictionService) return respondError(res, 503, 'Prediction service not configured');
    const payload = (req.body ?? {}) as Record<string, unknown>;

    try {
      const result = await predictionService.predictSpotPrice(payload);
      return res.json(result);
    } catch (err: any) {
      if (err instanceof PredictionValidationError) {
        return respondError(res, 400, err.message, err.details);
      }
      if (err instanceof PredictionDependencyError) {
        return respondError(res, 502, err.message, err.details);
      }
      if (err instanceof AlgorithmProcessorHttpError) {
        return respondError(res, err.status, 'Algorithm processor error', err.body);
      }
      if (err instanceof AlgorithmProcessorTimeoutError) {
        return respondError(res, 504, err.message);
      }
      return respondError(res, 502, 'Failed to reach algorithm processor');
    }
  });

  app.get('/v1/areas', async (_req, res) => {
    if (!db) return respondError(res, 503, 'TimescaleDB not available');
    try {
      const { areas } = await db.getAreas();
      return res.json({
        count: areas.length,
        areas,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return respondError(res, 500, err.message || 'Failed to fetch areas');
    }
  });

  app.get('/v1/state/latest', async (req, res) => {
    if (!db) return respondError(res, 503, 'TimescaleDB not available');
    const seriesId = parseSeriesId(req.query.series_id);
    if (!seriesId) return respondError(res, 400, 'series_id is required');

    try {
      const { reading, decision } = await db.getLatestState(seriesId);
      if (!reading && !decision) return respondError(res, 404, 'No data found for series_id');
      return res.json({
        series_id: seriesId,
        latest_reading: reading,
        latest_decision: decision,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return respondError(res, 500, err.message || 'Failed to fetch latest state');
    }
  });

  app.get('/v1/area/latest', async (req, res) => {
    if (!db) return respondError(res, 503, 'TimescaleDB not available');
    const area = parseArea(req.query.area);
    if (!area) return respondError(res, 400, 'area is required');
    const defaultLimit = Math.min(100, config.maxHistoryLimit);
    const limit = parseLimitValue(req.query.limit, config.maxHistoryLimit, defaultLimit);

    try {
      const data = await db.getLatestByArea(area, limit);
      if (!data.length) return respondError(res, 404, 'No data found for area');
      return res.json({
        area,
        count: data.length,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return respondError(res, 500, err.message || 'Failed to fetch area data');
    }
  });

  app.get('/v1/state/history', async (req, res) => {
    if (!db) return respondError(res, 503, 'TimescaleDB not available');
    const seriesId = parseSeriesId(req.query.series_id);
    if (!seriesId) return respondError(res, 400, 'series_id is required');
    const start = parseDateValue(req.query.start);
    const end = parseDateValue(req.query.end);
    if (!start || !end) return respondError(res, 400, 'start and end must be valid ISO timestamps');
    if (start > end) return respondError(res, 400, 'start must be before end');
    const defaultLimit = Math.min(500, config.maxHistoryLimit);
    const limit = parseLimitValue(req.query.limit, config.maxHistoryLimit, defaultLimit);

    try {
      const readings = await db.getRawHistory(seriesId, start, end, limit);
      return res.json({
        series_id: seriesId,
        start: start.toISOString(),
        end: end.toISOString(),
        limit,
        count: readings.length,
        data: readings,
      });
    } catch (err: any) {
      return respondError(res, 500, err.message || 'Failed to fetch history');
    }
  });

  app.get('/v1/decisions/history', async (req, res) => {
    if (!db) return respondError(res, 503, 'TimescaleDB not available');
    const seriesId = parseSeriesId(req.query.series_id);
    if (!seriesId) return respondError(res, 400, 'series_id is required');
    const start = parseDateValue(req.query.start);
    const end = parseDateValue(req.query.end);
    if (!start || !end) return respondError(res, 400, 'start and end must be valid ISO timestamps');
    if (start > end) return respondError(res, 400, 'start must be before end');
    const defaultLimit = Math.min(500, config.maxHistoryLimit);
    const limit = parseLimitValue(req.query.limit, config.maxHistoryLimit, defaultLimit);

    try {
      const decisions = await db.getDecisionHistory(seriesId, start, end, limit);
      return res.json({
        series_id: seriesId,
        start: start.toISOString(),
        end: end.toISOString(),
        limit,
        count: decisions.length,
        data: decisions,
      });
    } catch (err: any) {
      return respondError(res, 500, err.message || 'Failed to fetch decisions');
    }
  });

  app.get('/v1/stream/latest', async (_req, res) => {
    if (!db) return respondError(res, 503, 'TimescaleDB not available');
    try {
      const stats = await db.getStreamStats();
      return res.json({
        latest_timestamp: stats.latestTimestamp,
        total_readings: stats.totalReadings,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return respondError(res, 500, err.message || 'Failed to fetch stream stats');
    }
  });

  return app;
}
