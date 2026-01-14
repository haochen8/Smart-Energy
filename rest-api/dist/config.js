"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const bool = (value, fallback) => {
    if (typeof value === 'undefined')
        return fallback;
    return ['true', '1', 'yes'].includes(value.toLowerCase());
};
const num = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const list = (value) => {
    if (!value)
        return [];
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};
exports.config = {
    env: process.env.NODE_ENV || 'development',
    port: num(process.env.PORT, 8080),
    apiKey: process.env.API_KEY || '',
    corsOrigins: list(process.env.CORS_ORIGINS),
    maxHistoryLimit: num(process.env.MAX_HISTORY_LIMIT, 1000),
    timescaleEnabled: bool(process.env.TIMESCALE_ENABLED, true),
    timescaleHost: process.env.TIMESCALE_HOST || 'timescaledb',
    timescalePort: num(process.env.TIMESCALE_PORT, 5432),
    timescaleDb: process.env.TIMESCALE_DB || 'kalmar_digital_twin',
    timescaleUser: process.env.TIMESCALE_USER || 'kalmar_user',
    timescalePassword: process.env.TIMESCALE_PASSWORD || '',
    timescaleSsl: bool(process.env.TIMESCALE_SSL, false),
};
