import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  env: string;
  port: number;
  apiKey: string;
  corsOrigins: string[];
  maxHistoryLimit: number;
  algorithmProcessorBaseUrl: string;
  algorithmProcessorTimeoutMs: number;
  timescaleEnabled: boolean;
  timescaleHost: string;
  timescalePort: number;
  timescaleDb: string;
  timescaleUser: string;
  timescalePassword: string;
  timescaleSsl: boolean;
  uiJwtSecret: string;
  uiAuthUsername: string;
  uiAuthPassword: string;
}

const bool = (value: string | undefined, fallback: boolean) => {
  if (typeof value === 'undefined') return fallback;
  return ['true', '1', 'yes'].includes(value.toLowerCase());
};

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const config: AppConfig = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 8080),
  apiKey: process.env.API_KEY || '',
  corsOrigins: list(process.env.CORS_ORIGINS),
  maxHistoryLimit: num(process.env.MAX_HISTORY_LIMIT, 1000),
  algorithmProcessorBaseUrl: process.env.ALGORITHM_PROCESSOR_BASE_URL || 'http://localhost:5001',
  algorithmProcessorTimeoutMs: num(process.env.ALGORITHM_PROCESSOR_TIMEOUT_MS, 5000),
  timescaleEnabled: bool(process.env.TIMESCALE_ENABLED, true),
  timescaleHost: process.env.TIMESCALE_HOST || 'timescaledb',
  timescalePort: num(process.env.TIMESCALE_PORT, 5432),
  timescaleDb: process.env.TIMESCALE_DB || 'kalmar_digital_twin',
  timescaleUser: process.env.TIMESCALE_USER || 'kalmar_user',
  timescalePassword: process.env.TIMESCALE_PASSWORD || '',
  timescaleSsl: bool(process.env.TIMESCALE_SSL, false),
  uiJwtSecret: process.env.UI_JWT_SECRET || '',
  uiAuthUsername: process.env.UI_AUTH_USERNAME || '',
  uiAuthPassword: process.env.UI_AUTH_PASSWORD || '',
};
