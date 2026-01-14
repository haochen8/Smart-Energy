"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const crypto_1 = require("crypto");
const config_1 = require("./config");
const openapi_1 = require("./openapi");
const corsAllowAll = config_1.config.corsOrigins.includes('*');
const corsOrigins = new Set(config_1.config.corsOrigins.filter((origin) => origin !== '*'));
function respondError(res, status, message, details) {
    return res.status(status).json({ error: message, details });
}
function parseSeriesId(raw) {
    if (typeof raw !== 'string')
        return null;
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
}
function parseDateValue(raw) {
    if (typeof raw !== 'string' || !raw.trim())
        return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed;
}
function parseLimitValue(raw, maxLimit, defaultLimit) {
    const parsed = typeof raw === 'string' ? Number(raw) : Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return defaultLimit;
    return Math.min(Math.floor(parsed), maxLimit);
}
function createApp(db) {
    const app = (0, express_1.default)();
    app.set('trust proxy', true);
    app.use(express_1.default.json({ limit: '1mb' }));
    app.use((req, res, next) => {
        const requestId = req.headers['x-request-id'] ?? (0, crypto_1.randomUUID)();
        res.setHeader('X-Request-Id', requestId);
        const start = process.hrtime.bigint();
        res.on('finish', () => {
            const durationMs = Number(process.hrtime.bigint() - start) / 1000000;
            console.log(JSON.stringify({
                level: 'info',
                msg: 'request',
                request_id: requestId,
                method: req.method,
                path: req.originalUrl,
                status: res.statusCode,
                duration_ms: Math.round(durationMs),
                client_ip: req.ip,
                user_agent: req.headers['user-agent'] ?? null,
            }));
        });
        next();
    });
    app.use((req, res, next) => {
        const origin = req.headers.origin;
        if (origin && (corsAllowAll || corsOrigins.has(origin))) {
            res.setHeader('Access-Control-Allow-Origin', corsAllowAll ? '*' : origin);
            res.setHeader('Vary', 'Origin');
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Request-Id');
        if (req.method === 'OPTIONS')
            return res.sendStatus(204);
        next();
    });
    app.use((req, res, next) => {
        if (req.path === '/health')
            return next();
        if (req.path === '/openapi.json')
            return next();
        if (req.path === '/docs' || req.path.startsWith('/docs/'))
            return next();
        if (!config_1.config.apiKey)
            return respondError(res, 500, 'API key not configured');
        const apiKey = req.get('X-API-Key');
        if (!apiKey)
            return respondError(res, 401, 'Missing API key');
        if (apiKey !== config_1.config.apiKey)
            return respondError(res, 403, 'Invalid API key');
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
                meta: { url: '/v1/meta', method: 'GET' },
                state_latest: { url: '/v1/state/latest', method: 'GET' },
                state_history: { url: '/v1/state/history', method: 'GET' },
                decisions_history: { url: '/v1/decisions/history', method: 'GET' },
            },
        });
    });
    app.get('/openapi.json', (_req, res) => {
        res.json(openapi_1.openApiSpec);
    });
    app.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openapi_1.openApiSpec, {
        swaggerOptions: {
            persistAuthorization: true,
        },
    }));
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
            environment: config_1.config.env,
            timescale_enabled: config_1.config.timescaleEnabled,
            max_history_limit: config_1.config.maxHistoryLimit,
            cors_origins: config_1.config.corsOrigins,
            timestamp: new Date().toISOString(),
        });
    });
    app.get('/v1/state/latest', async (req, res) => {
        if (!db)
            return respondError(res, 503, 'TimescaleDB not available');
        const seriesId = parseSeriesId(req.query.series_id);
        if (!seriesId)
            return respondError(res, 400, 'series_id is required');
        try {
            const { reading, decision } = await db.getLatestState(seriesId);
            if (!reading && !decision)
                return respondError(res, 404, 'No data found for series_id');
            return res.json({
                series_id: seriesId,
                latest_reading: reading,
                latest_decision: decision,
                timestamp: new Date().toISOString(),
            });
        }
        catch (err) {
            return respondError(res, 500, err.message || 'Failed to fetch latest state');
        }
    });
    app.get('/v1/state/history', async (req, res) => {
        if (!db)
            return respondError(res, 503, 'TimescaleDB not available');
        const seriesId = parseSeriesId(req.query.series_id);
        if (!seriesId)
            return respondError(res, 400, 'series_id is required');
        const start = parseDateValue(req.query.start);
        const end = parseDateValue(req.query.end);
        if (!start || !end)
            return respondError(res, 400, 'start and end must be valid ISO timestamps');
        if (start > end)
            return respondError(res, 400, 'start must be before end');
        const defaultLimit = Math.min(500, config_1.config.maxHistoryLimit);
        const limit = parseLimitValue(req.query.limit, config_1.config.maxHistoryLimit, defaultLimit);
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
        }
        catch (err) {
            return respondError(res, 500, err.message || 'Failed to fetch history');
        }
    });
    app.get('/v1/decisions/history', async (req, res) => {
        if (!db)
            return respondError(res, 503, 'TimescaleDB not available');
        const seriesId = parseSeriesId(req.query.series_id);
        if (!seriesId)
            return respondError(res, 400, 'series_id is required');
        const start = parseDateValue(req.query.start);
        const end = parseDateValue(req.query.end);
        if (!start || !end)
            return respondError(res, 400, 'start and end must be valid ISO timestamps');
        if (start > end)
            return respondError(res, 400, 'start must be before end');
        const defaultLimit = Math.min(500, config_1.config.maxHistoryLimit);
        const limit = parseLimitValue(req.query.limit, config_1.config.maxHistoryLimit, defaultLimit);
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
        }
        catch (err) {
            return respondError(res, 500, err.message || 'Failed to fetch decisions');
        }
    });
    return app;
}
