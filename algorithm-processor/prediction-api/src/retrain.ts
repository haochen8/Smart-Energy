import fs from 'fs';
import path from 'path';
import { createClient } from 'redis';
import { config } from './config.js';

interface TrainingSummary {
  total_points: number;
  area_count: number;
  date_range: { start: string | null; end: string | null };
  training_completed_at: string;
}

async function loadRedis() {
  const client = createClient({ url: `redis://${config.redisHost}:${config.redisPort}`, database: config.redisDb });
  await client.connect();
  return client;
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export async function runRetraining() {
  const redis = await loadRedis().catch(() => null);
  if (!redis) {
    console.warn('Redis unavailable; retraining aborted.');
    return false;
  }
  try {
    const activeAreas = await redis.sMembers('areas:active');
    const allData: { timestamp: string; value: number; area: string }[] = [];
    for (const area of activeAreas) {
      const timelineKey = `timeline:${area}`;
      const timestamps = await redis.zRange(timelineKey, 0, -1);
      for (const ts of timestamps) {
        const raw = await redis.get(`timeseries:${area}:${ts}`);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          allData.push({ timestamp: parsed.timestamp, value: Number(parsed.price ?? parsed.value), area });
        } catch (_) {
          continue;
        }
      }
    }

    if (allData.length < 50) {
      console.warn('Insufficient data for training');
      return false;
    }

    const values = allData.map((p) => p.value).filter((v) => Number.isFinite(v));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;

    const model = {
      lookbackWindow: config.lookbackWindow,
      mean,
      variance,
      trained_at: new Date().toISOString(),
    };

    ensureDir(path.dirname(config.modelPath));
    fs.writeFileSync(config.modelPath, JSON.stringify(model, null, 2));
    const summary: TrainingSummary = {
      total_points: allData.length,
      area_count: new Set(allData.map((d) => d.area)).size,
      date_range: {
        start: allData[0]?.timestamp ?? null,
        end: allData[allData.length - 1]?.timestamp ?? null,
      },
      training_completed_at: new Date().toISOString(),
    };
    await redis.set('training:data_summary', JSON.stringify(summary));
    console.log('Retraining completed');
    return true;
  } catch (err) {
    console.error('Retraining failed', err);
    return false;
  }
}

if (process.env.NODE_ENV !== 'test') {
  runRetraining().then((ok) => {
    if (!ok) process.exit(1);
    process.exit(0);
  });
}
