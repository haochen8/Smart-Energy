import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  timescaleEnabled: boolean;
  timescaleHost: string;
  timescalePort: number;
  timescaleDb: string;
  timescaleUser: string;
  timescalePassword: string;
  timescaleSsl: boolean;
  timescaleEnableRetention: boolean;
  timescaleRetentionDays: number;
  redisHost: string;
  redisPort: number;
  redisDb: number;
  redisTtlTimeseries: number;
  redisTtlPredictions: number;
  modelPath: string;
  lookbackWindow: number;
  dataPath: string;
  priceLookback: number;
  minPoints: number;
  defaultHorizonMinutes: number;
  secretKey: string;
  debug: boolean;
  host: string;
  port: number;
  maxDataPointsPerRequest: number;
  maxSeriesPerInstance: number;
  priceThreshold: number;
  lowPriceThreshold: number;
  offpeakHours: string;
  spikeDeltaPct: number;
  forecastHorizonMinutes: number;
  forecastPoints: number;
  historyLookbackPoints: number;
  processEveryN: number;
  maxMessagesPerSecond: number;
  enableStreamConsumer: boolean;
  kafkaBrokers: string;
  energyTopic: string;
  processedTopic: string;
  consumerGroup: string;
  streamHorizonMinutes: number;
  maxStreamBuffer: number;
  logLevel: string;
  workers: number;
  timeout: number;
  maxRequests: number;
  maxRequestsJitter: number;
}

const bool = (value: string | undefined, fallback: boolean) => {
  if (typeof value === 'undefined') return fallback;
  return ['true', '1', 'yes'].includes(value.toLowerCase());
};

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config: AppConfig = {
  timescaleEnabled: bool(process.env.TIMESCALE_ENABLED, false),
  timescaleHost: process.env.TIMESCALE_HOST || 'timescaledb',
  timescalePort: num(process.env.TIMESCALE_PORT, 5432),
  timescaleDb: process.env.TIMESCALE_DB || 'kalmar_digital_twin',
  timescaleUser: process.env.TIMESCALE_USER || 'kalmar_user',
  timescalePassword: process.env.TIMESCALE_PASSWORD || '',
  timescaleSsl: bool(process.env.TIMESCALE_SSL, false),
  timescaleEnableRetention: bool(process.env.TIMESCALE_ENABLE_RETENTION, true),
  timescaleRetentionDays: num(process.env.TIMESCALE_RETENTION_DAYS, 365),
  redisHost: process.env.REDIS_HOST || 'redis',
  redisPort: num(process.env.REDIS_PORT, 6379),
  redisDb: num(process.env.REDIS_DB, 0),
  redisTtlTimeseries: num(process.env.REDIS_TTL_TIMESERIES, 3600),
  redisTtlPredictions: num(process.env.REDIS_TTL_PREDICTIONS, 86400),
  modelPath: process.env.MODEL_PATH || '/app/models/timeseries_model.json',
  lookbackWindow: num(process.env.LOOKBACK_WINDOW, 20),
  dataPath: process.env.DATA_PATH || '/app/data',
  priceLookback: num(process.env.PRICE_LOOKBACK, 24),
  minPoints: num(process.env.MIN_POINTS, 12),
  defaultHorizonMinutes: num(process.env.DEFAULT_HORIZON_MINUTES, 60),
  secretKey: process.env.SECRET_KEY || 'dev-secret-key-change-in-production',
  debug: bool(process.env.FLASK_DEBUG, false),
  host: process.env.FLASK_HOST || '0.0.0.0',
  port: num(process.env.FLASK_PORT, 5001),
  maxDataPointsPerRequest: num(process.env.MAX_DATA_POINTS_PER_REQUEST, 1000),
  maxSeriesPerInstance: num(process.env.MAX_SERIES_PER_INSTANCE, 100),
  priceThreshold: Number(process.env.PRICE_THRESHOLD) || 80.0,
  lowPriceThreshold: Number(process.env.LOW_PRICE_THRESHOLD) || 25.0,
  offpeakHours: process.env.OFFPEAK_HOURS || '0-6,22-23',
  spikeDeltaPct: Number(process.env.SPIKE_DELTA_PCT) || 15.0,
  forecastHorizonMinutes: num(process.env.FORECAST_HORIZON_MINUTES, 240),
  forecastPoints: num(process.env.FORECAST_POINTS, 4),
  historyLookbackPoints: num(process.env.HISTORY_LOOKBACK_POINTS, 48),
  processEveryN: num(process.env.PROCESS_EVERY_N, 1),
  maxMessagesPerSecond: num(process.env.MAX_MESSAGES_PER_SECOND, 200),
  enableStreamConsumer: bool(process.env.ENABLE_STREAM_CONSUMER, true),
  kafkaBrokers: process.env.KAFKA_BROKERS || 'localhost:9092',
  energyTopic: process.env.ENERGY_TOPIC || 'meter-readings',
  processedTopic: process.env.PROCESSED_TOPIC || 'energy-processed',
  consumerGroup: process.env.CONSUMER_GROUP || 'algorithm-processor',
  streamHorizonMinutes: num(process.env.STREAM_HORIZON_MINUTES, 60),
  maxStreamBuffer: num(process.env.MAX_STREAM_BUFFER, 48),
  logLevel: process.env.LOG_LEVEL || 'info',
  workers: num(process.env.GUNICORN_WORKERS, 2),
  timeout: num(process.env.GUNICORN_TIMEOUT, 60),
  maxRequests: num(process.env.GUNICORN_MAX_REQUESTS, 1000),
  maxRequestsJitter: num(process.env.GUNICORN_MAX_REQUESTS_JITTER, 100),
};

export function parseOffpeakRanges(rawRanges: string): Array<[number, number]> {
  return rawRanges
    .split(',')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => block.split('-', 2))
    .map(([start, end]) => [Number(start), Number(end)] as [number, number])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end));
}
