import { createClient } from "redis";
import type { MeterReading } from "../models/MeterReading";
import { REDIS_DB, REDIS_ENABLED, REDIS_HOST, REDIS_PORT } from "../config";
import logger from "../logger";

let client: ReturnType<typeof createClient> | null = null;
let initAttempted = false;

async function getRedisClient() {
  if (!REDIS_ENABLED || !REDIS_HOST) return null;
  if (client) return client;
  if (initAttempted) return null;
  initAttempted = true;

  try {
    client = createClient({ url: `redis://${REDIS_HOST}:${REDIS_PORT}`, database: REDIS_DB });
    await client.connect();
    logger.info({ host: REDIS_HOST, port: REDIS_PORT, db: REDIS_DB }, "Redis history writer connected");
    return client;
  } catch (err) {
    logger.warn({ err }, "Redis history writer unavailable");
    client = null;
    return null;
  }
}

export async function storeReadingsInRedis(readings: MeterReading[]): Promise<void> {
  const redis = await getRedisClient();
  if (!redis || !readings.length) return;

  const multi = redis.multi();
  let queued = 0;

  for (const reading of readings) {
    const parsedTs = Date.parse(reading.timestamp);
    if (!Number.isFinite(parsedTs)) continue;
    const seriesId = reading.meter_id;
    const timestamp = reading.timestamp;
    const payload = {
      timestamp,
      price: reading.spot_price,
      area: reading.area,
      customer: "unknown",
      series_id: seriesId,
      meter_id: seriesId,
    };

    multi.set(`timeseries:${seriesId}:${timestamp}`, JSON.stringify(payload));
    multi.zAdd(`timeline:${seriesId}`, [{ score: parsedTs / 1000, value: timestamp }]);
    queued += 2;
  }

  if (!queued) return;
  try {
    await multi.exec();
  } catch (err) {
    logger.warn({ err }, "Failed to write history to Redis");
  }
}
