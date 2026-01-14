import { createClient } from 'redis';
import { config } from './config.js';

const INGESTION_INTERVAL = Number(process.env.INGESTION_INTERVAL ?? 30);
const LOOKBACK_WINDOW = config.lookbackWindow;

const dataSources = ['sensor_1', 'sensor_2', 'website_traffic', 'sales_data'];

async function connectRedis() {
  const client = createClient({ url: `redis://${config.redisHost}:${config.redisPort}`, database: config.redisDb });
  await client.connect();
  await client.ping();
  return client;
}

function generateRealisticDataPoint(area: string) {
  const now = new Date();
  const patterns: Record<string, { base: number; trend: number; seasonalAmplitude: number; noise: number }> = {
    sensor_1: { base: 25, trend: 0.001, seasonalAmplitude: 5, noise: 0.5 },
    sensor_2: { base: 60, trend: -0.0005, seasonalAmplitude: 10, noise: 1 },
    website_traffic: { base: 1000, trend: 0.01, seasonalAmplitude: 200, noise: 50 },
    sales_data: { base: 5000, trend: 0.005, seasonalAmplitude: 1000, noise: 100 },
  };
  const pattern = patterns[area] ?? patterns.sensor_1;
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  let value = pattern.base;
  const daysSinceEpoch = Math.floor((now.getTime() - Date.UTC(2024, 0, 1)) / (24 * 3600 * 1000));
  value += pattern.trend * daysSinceEpoch;
  value += pattern.seasonalAmplitude * Math.sin((2 * Math.PI * hour) / 24);
  value += pattern.seasonalAmplitude * 0.3 * Math.sin((2 * Math.PI * day) / 7);
  value += (Math.random() - 0.5) * 2 * pattern.noise;
  return { timestamp: now.toISOString(), price: Number(value.toFixed(2)), area, source: 'data_ingester' };
}

async function storeDataPoint(redis: ReturnType<typeof createClient>, point: ReturnType<typeof generateRealisticDataPoint>) {
  const { area, timestamp, price } = point;
  const pointKey = `timeseries:${area}:${timestamp}`;
  await redis.set(pointKey, JSON.stringify({ timestamp, price, area }));
  const score = new Date(timestamp).getTime() / 1000;
  await redis.zAdd(`timeline:${area}`, [{ score, value: timestamp }]);
  await redis.sAdd('areas:active', area);
  const recentTimestamps = await redis.zRange(`timeline:${area}`, -LOOKBACK_WINDOW, -1, { REV: true });
  const recent: Array<{ timestamp: string; price: number }> = [];
  for (const ts of recentTimestamps.reverse()) {
    const raw = await redis.get(`timeseries:${area}:${ts}`);
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    recent.push({ timestamp: parsed.timestamp, price: parsed.price ?? parsed.value });
  }
  await redis.set(`recent:${area}`, JSON.stringify(recent));
}

async function updateIngestionMetrics(redis: ReturnType<typeof createClient>) {
  const metricsKey = 'ingestion:metrics';
  const now = new Date().toISOString();
  const existingRaw = await redis.get(metricsKey);
  const current = existingRaw ? JSON.parse(existingRaw) : {};
  current.last_ingestion = now;
  current.total_points_today = (current.total_points_today ?? 0) + dataSources.length;
  current.status = 'active';
  current.sources = dataSources;
  current.storage_type = 'redis_only';
  await redis.setEx(metricsKey, 86400, JSON.stringify(current));
}

export async function runContinuousIngestion() {
  const redis = await connectRedis();
  console.log(`Starting continuous data ingestion every ${INGESTION_INTERVAL}s`);
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (const source of dataSources) {
        const point = generateRealisticDataPoint(source);
        await storeDataPoint(redis, point);
      }
      await updateIngestionMetrics(redis);
      await new Promise((resolve) => setTimeout(resolve, INGESTION_INTERVAL * 1000));
    }
  } catch (err) {
    console.error('Data ingestion failed', err);
  }
}

if (process.env.NODE_ENV !== 'test') {
  runContinuousIngestion();
}
