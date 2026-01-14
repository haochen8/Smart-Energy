import express, { Request, Response } from 'express';
import { createServer, Server } from 'http';
import { config } from './config.js';
import { SpotPricePredictor } from './spotPricePredictor.js';
import { buildAlgorithmProcessor, buildRedisClient, startConsumerIfEnabled, type RedisClient } from './processorService.js';
import { TimeSeriesPredictor, HistoricalPoint } from './timeSeriesPredictor.js';
import bodyParser from 'body-parser';

// Initialize shared instances (populated in init())
let redisClient: RedisClient = null;
let predictor: TimeSeriesPredictor;
let spotPricePredictor: SpotPricePredictor;
let algorithmProcessor: Awaited<ReturnType<typeof buildAlgorithmProcessor>>;
let streamProcessor: Awaited<ReturnType<typeof startConsumerIfEnabled>>;

const app = express();
app.use(bodyParser.json({ limit: '1mb' }));

function respondError(res: Response, status: number, message: string, details?: unknown) {
  return res.status(status).json({ error: message, details });
}

function resolveArea(payload: Record<string, unknown>): string | null {
  const areaRaw = payload['AREA'] ?? payload['area'] ?? payload['Area'];
  if (typeof areaRaw !== 'string') return null;
  const trimmed = areaRaw.trim();
  return trimmed ? trimmed : null;
}

function normalizePriceRecord(
  record: Record<string, unknown>,
  fallbackArea?: string,
): { area: string; point: HistoricalPoint } | null {
  const timestamp = (record['DateTime'] ?? record['timestamp'] ?? record['time'] ?? record['date']) as string | undefined;
  const priceRaw = record['price'] ?? record['Price'] ?? record['spot_price'];
  const areaRaw = (record['AREA'] ?? record['area'] ?? fallbackArea) as string | undefined;
  if (!timestamp || priceRaw === undefined || priceRaw === null || !areaRaw) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  const price = Number(priceRaw);
  if (!Number.isFinite(price)) return null;
  return { area: areaRaw.trim(), point: { timestamp: parsed.toISOString(), value: price } };
}

function validateDataPoint(point: any, area: string) {
  if (typeof point !== 'object' || point === null) {
    return { valid: false, error: 'Data point must be a dictionary', cleaned: null };
  }
  const timestamp = point.timestamp;
  const value = point.value;
  if (!timestamp) return { valid: false, error: "Missing 'timestamp' field", cleaned: null };
  if (value === undefined || value === null) return { valid: false, error: "Missing 'value' field", cleaned: null };
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return { valid: false, error: `Invalid timestamp format '${timestamp}'`, cleaned: null };
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return { valid: false, error: `Value must be numeric, got: ${value}`, cleaned: null };
  }
  if (typeof area !== 'string' || !area.trim()) {
    return { valid: false, error: 'AREA must be a non-empty string', cleaned: null };
  }
  return {
    valid: true,
    error: null,
    cleaned: { timestamp: parsed.toISOString().slice(0, 19), value: numericValue, area: area.trim() },
  };
}

app.get('/', (_req, res) => {
  const endpoints = {
    health: { url: '/health', method: 'GET', description: 'Health check endpoint' },
    predict: { url: '/predict', method: 'POST', description: 'Make time-series predictions' },
    predict_spot_price: { url: '/predict/spot-price', method: 'POST', description: 'Predict near-term spot price' },
    process_message: { url: '/process/message', method: 'POST', description: 'Run decision flow on message' },
    add_data: { url: '/add_data', method: 'POST', description: 'Add data points to Redis' },
    status: { url: '/status/<area>', method: 'GET', description: 'Get status information for an area' },
  };
  res.json({
    message: 'Time Series Prediction API',
    version: '2.0.0',
    status: 'running',
    redis_connected: Boolean(redisClient),
    model_loaded: Boolean(predictor),
    available_endpoints: endpoints,
  });
});

app.get('/health', async (_req, res) => {
  const status: Record<string, unknown> = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    redis_connected: Boolean(redisClient),
    model_loaded: Boolean(predictor),
    algorithm_processor_ready: Boolean(algorithmProcessor),
    stream_consumer_running: Boolean(streamProcessor),
  };
  if (redisClient) {
    try {
      await redisClient.ping();
      status.redis_status = 'connected';
    } catch {
      status.redis_status = 'disconnected';
      status.redis_connected = false;
    }
  }
  res.json(status);
});

app.post('/predict/spot-price', async (req, res) => {
  const payload = req.body ?? {};
  const records = payload.records || payload.data || payload.historical_data;
  if (!Array.isArray(records) || !records.length) {
    return respondError(res, 400, "Payload must include 'records' as a non-empty list");
  }
  const horizon = Number(payload.horizon_minutes ?? config.defaultHorizonMinutes);
  try {
    const result = spotPricePredictor.predict(records, horizon);
    const predictionKey = `predicted_price_next_${horizon}min`;
    const response = {
      [predictionKey]: result.predictedPrice,
      confidence: result.confidence,
      trend: result.trend,
      change_pct: result.changePct,
      volatility: result.volatility,
      explanation: result.explanation,
      recommendation: result.recommendation,
      metadata: {
        horizon_minutes: result.horizonMinutes,
        lookback_used: result.lookbackUsed,
        supporting_points: result.supportingPoints,
        interval_minutes: result.intervalMinutes,
      },
    };
    res.json(response);
  } catch (err: any) {
    if (err instanceof Error) return respondError(res, 400, err.message);
    return respondError(res, 500, 'Prediction failed');
  }
});

app.post('/process/message', async (req, res) => {
  const payload = req.body ?? {};
  try {
    const decision = await algorithmProcessor.process(payload);
    const response = {
      actionType: decision.actionType,
      currentPrice: decision.currentPrice,
      threshold: decision.threshold,
      predictedValues: decision.predictedValues,
      predictedSpike: decision.predictedSpike,
      confidenceScore: decision.confidenceScore,
      timestamp: decision.timestamp.toISOString(),
      explanation: decision.explanation,
    };
    res.json(response);
  } catch (err: any) {
    if (err instanceof Error) return respondError(res, 400, err.message);
    return respondError(res, 500, 'Processing failed');
  }
});

app.post('/predict', async (req, res) => {
  try {
    const data = req.body ?? {};
    const area = resolveArea(data);
    if (!area) return respondError(res, 400, 'AREA is required for prediction');

    const horizonMinutes = Number(data.horizon_minutes ?? config.defaultHorizonMinutes);
    const minHistoryPoints = Math.max(10, config.minPoints);
    const incomingRecords = Array.isArray(data.records)
      ? data.records
      : Array.isArray(data.historical_data)
        ? data.historical_data
        : Array.isArray(data.data_points)
          ? data.data_points
          : null;

    const validated: HistoricalPoint[] = [];
    const errors: string[] = [];
    if (Array.isArray(incomingRecords)) {
      incomingRecords.forEach((point: any, idx: number) => {
        const normalized = normalizePriceRecord(point as Record<string, unknown>, area);
        if (normalized) {
          if (normalized.area !== area) {
            errors.push(`Point ${idx + 1}: AREA mismatch (${normalized.area})`);
          } else {
            validated.push(normalized.point);
          }
          return;
        }
        const result = validateDataPoint(point, area);
        if (result.valid && result.cleaned) {
          validated.push({ timestamp: result.cleaned.timestamp, value: result.cleaned.value });
        } else if (result.error) {
          errors.push(`Point ${idx + 1}: ${result.error}`);
        } else {
          errors.push(`Point ${idx + 1}: Invalid price record`);
        }
      });
    }

    const singlePoint = normalizePriceRecord(data as Record<string, unknown>, area);
    if (singlePoint && singlePoint.area === area) {
      validated.push(singlePoint.point);
    }

    if (errors.length) return respondError(res, 400, 'Data validation failed', { validation_errors: errors });
    if (redisClient && validated.length) await storePoints(area, validated);

    const historicalData = await fetchHistorical(area, validated);
    if (historicalData.length < minHistoryPoints) {
      return respondError(res, 400, 'Insufficient historical data for prediction', {
        area,
        required_points: minHistoryPoints,
        available_points: historicalData.length,
        redis_connected: Boolean(redisClient),
      });
    }

    const predictorRecords = historicalData.map((point) => ({
      DateTime: point.timestamp,
      price: point.value,
      AREA: area,
    }));
    const result = spotPricePredictor.predict(predictorRecords, horizonMinutes);

    const response: Record<string, unknown> = {
      area,
      predicted_price: result.predictedPrice,
      confidence: result.confidence,
      trend: result.trend,
      change_pct: result.changePct,
      volatility: result.volatility,
      explanation: result.explanation,
      recommendation: result.recommendation,
      data_points_used: result.supportingPoints,
      horizon_minutes: result.horizonMinutes,
      timestamp: new Date().toISOString(),
      redis_connected: Boolean(redisClient),
      prediction_quality: 'HIGH - Based on historical data',
    };

    if (redisClient) {
      try {
        const predictionKey = `predictions:${area}:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
        await redisClient.setEx(predictionKey, 86400, JSON.stringify(response));
      } catch (err) {
        console.warn('Failed to store prediction in Redis', err);
      }
    }

    res.json(response);
  } catch (err: any) {
    if (err instanceof Error) return respondError(res, 500, `Prediction failed: ${err.message}`);
    return respondError(res, 500, 'Prediction failed');
  }
});

app.post('/add_data', async (req, res) => {
  try {
    const data = req.body ?? {};
    const area = resolveArea(data);
    if (!area) return respondError(res, 400, 'AREA is required to add data');
    const newDataPoints = data.data_points;
    if (!Array.isArray(newDataPoints) || !newDataPoints.length) {
      return respondError(res, 400, 'data_points must be a non-empty list');
    }
    if (!redisClient) return respondError(res, 500, 'Redis not available for data storage');

    const validated: HistoricalPoint[] = [];
    const errors: string[] = [];
    newDataPoints.forEach((point: any, idx: number) => {
      const result = validateDataPoint(point, area);
      if (result.valid && result.cleaned) {
        validated.push({ timestamp: result.cleaned.timestamp, value: result.cleaned.value });
      } else if (result.error) {
        errors.push(`Point ${idx + 1}: ${result.error}`);
      }
    });

    if (errors.length) return respondError(res, 400, 'Data validation failed', { validation_errors: errors });
    await storePoints(area, validated);

    const recent = await fetchHistorical(area, []);
    const response = {
      status: 'success',
      area,
      points_added: validated.length,
      recent_points_cached: recent.length,
      timestamp: new Date().toISOString(),
      storage_type: 'redis_persistent',
    };
    res.json(response);
  } catch (err: any) {
    return respondError(res, 500, err.message || 'Failed to add data');
  }
});

app.get('/status/:area', async (req, res) => {
  try {
    if (!redisClient) return respondError(res, 500, 'Redis not available');
    const area = req.params.area;
    const exists = await redisClient.sIsMember('areas:active', area);
    if (!exists) {
      return res.json({
        area,
        status: 'no_data',
        data_points: 0,
        message: 'No data found for this area',
      });
    }
    const timelineKey = `timeline:${area}`;
    const totalPoints = await redisClient.zCard(timelineKey);
    const earliest = await redisClient.zRange(timelineKey, 0, 0);
    const latest = await redisClient.zRange(timelineKey, -1, -1);
    const predictionKeys = await redisClient.keys(`predictions:${area}:*`);
    res.json({
      area,
      status: 'active',
      total_data_points: totalPoints,
      recent_predictions: predictionKeys.length,
      data_range: { earliest: earliest[0] || null, latest: latest[0] || null },
      storage_type: 'redis_persistent',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return respondError(res, 500, err.message || 'Status check failed');
  }
});

app.post('/reload_model', (_req, res) => {
  predictor.reload();
  res.json({
    status: 'success',
    message: 'Model reloaded successfully',
    timestamp: new Date().toISOString(),
    model_loaded: true,
  });
});

app.get('/model/metadata', async (_req, res) => {
  const metadata: Record<string, unknown> = {
    model_path: config.modelPath,
    model_loaded: Boolean(predictor),
    lookback_window: config.lookbackWindow,
    current_timestamp: new Date().toISOString(),
  };
  if (redisClient) {
    try {
      const redisMetadata = await redisClient.get('model:metadata');
      if (redisMetadata) Object.assign(metadata, JSON.parse(redisMetadata));
    } catch (err) {
      console.warn('Could not retrieve metadata from Redis', err);
    }
  }
  res.json(metadata);
});

app.get('/data/ingestion/status', async (_req, res) => {
  if (!redisClient) return respondError(res, 500, 'Redis not available');
  try {
    const metricsRaw = await redisClient.get('ingestion:metrics');
    const metrics = metricsRaw ? JSON.parse(metricsRaw) : { status: 'no_data', message: 'No ingestion data available' };
    const seriesKeys = await redisClient.keys('timeseries:*');
    metrics.active_areas = seriesKeys.length;
    metrics.area_list = seriesKeys.map((key: string) => key.split(':')[1]);
    res.json(metrics);
  } catch (err: any) {
    return respondError(res, 500, err.message || 'Failed to get ingestion status');
  }
});

app.get('/data/historical/summary', async (_req, res) => {
  if (!redisClient) return respondError(res, 500, 'Redis not available');
  const summary: Record<string, unknown> = {
    storage_type: 'redis_persistent',
    active_areas: [] as unknown[],
    total_data_points: 0,
    total_areas: 0,
  };
  try {
    const activeAreas = await redisClient.sMembers('areas:active');
    summary.total_areas = activeAreas.length;
    for (const area of activeAreas) {
      const timelineKey = `timeline:${area}`;
      const pointCount = await redisClient.zCard(timelineKey);
      const earliest = await redisClient.zRange(timelineKey, 0, 0);
      const latest = await redisClient.zRange(timelineKey, -1, -1);
      (summary.active_areas as any[]).push({
        area,
        data_points: pointCount,
        earliest_timestamp: earliest[0] || null,
        latest_timestamp: latest[0] || null,
      });
      summary.total_data_points = (summary.total_data_points as number) + pointCount;
    }
    const trainingSummary = await redisClient.get('training:data_summary');
    if (trainingSummary) (summary as any).last_training = JSON.parse(trainingSummary);
  } catch (err: any) {
    (summary as any).error = err.message;
  }
  res.json(summary);
});

app.post('/admin/clear_cache', async (_req, res) => {
  if (!redisClient) return respondError(res, 500, 'Redis not available');
  try {
    const patterns = ['timeseries:*', 'recent:*', 'timeline:*', 'predictions:*'];
    let totalDeleted = 0;
    for (const pattern of patterns) {
      const keys = await redisClient.keys(pattern);
      if (keys.length) totalDeleted += await redisClient.del(keys);
    }
    await redisClient.del('areas:active');
    await redisClient.del('training:data_summary');
    res.json({
      status: 'success',
      message: `Cleared ${totalDeleted} data entries from Redis`,
      timestamp: new Date().toISOString(),
      storage_type: 'redis_persistent',
    });
  } catch (err: any) {
    return respondError(res, 500, err.message || 'Failed to clear data');
  }
});

async function storePoints(area: string, points: HistoricalPoint[]) {
  if (!redisClient) return;
  for (const point of points) {
    const pointKey = `timeseries:${area}:${point.timestamp}`;
    const payload = { timestamp: point.timestamp, price: point.value, area };
    await redisClient.set(pointKey, JSON.stringify(payload));
    const score = new Date(point.timestamp).getTime() / 1000;
    await redisClient.zAdd(`timeline:${area}`, [{ score, value: point.timestamp }]);
  }
  await redisClient.sAdd('areas:active', area);
  const recent = await redisClient.zRange(`timeline:${area}`, -config.lookbackWindow, -1, { REV: true });
  const recentData = [] as HistoricalPoint[];
  for (const ts of recent.reverse()) {
    const raw = await redisClient.get(`timeseries:${area}:${ts}`);
    if (!raw) continue;
    const parsed = JSON.parse(raw) as any;
    const price = Number(parsed.price ?? parsed.value);
    if (!Number.isFinite(price)) continue;
    recentData.push({ timestamp: parsed.timestamp, value: price });
  }
  await redisClient.set(`recent:${area}`, JSON.stringify(recentData));
}

async function fetchHistorical(area: string, fallback: HistoricalPoint[] | undefined): Promise<HistoricalPoint[]> {
  if (!redisClient) return fallback || [];
  const timelineKey = `timeline:${area}`;
  const timestamps = await redisClient.zRange(timelineKey, 0, -1);
  if (!timestamps.length) return fallback || [];
  const allData: HistoricalPoint[] = [];
  for (const ts of timestamps) {
    const raw = await redisClient.get(`timeseries:${area}:${ts}`);
    if (!raw) continue;
    const parsed = JSON.parse(raw) as any;
    const price = Number(parsed.price ?? parsed.value);
    if (!Number.isFinite(price)) continue;
    allData.push({ timestamp: parsed.timestamp, value: price });
  }
  allData.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return allData.length > config.lookbackWindow ? allData.slice(-config.lookbackWindow) : allData;
}

async function init() {
  if (process.env.NODE_ENV === 'test') {
    redisClient = null;
  } else {
    redisClient = await buildRedisClient(config.redisHost, config.redisPort, config.redisDb);
  }
  predictor = new TimeSeriesPredictor(config.modelPath, config.lookbackWindow);
  spotPricePredictor = new SpotPricePredictor(config.priceLookback, config.minPoints);
  algorithmProcessor = await buildAlgorithmProcessor(config, redisClient);
  streamProcessor = config.enableStreamConsumer ? await startConsumerIfEnabled(config, algorithmProcessor) : null;
}

export async function start(): Promise<Server> {
  if (!predictor) await init();
  return createServer(app).listen(config.port, () => {
    console.log(`API listening on http://${config.host}:${config.port}`);
  });
}

export async function initForTest() {
  await init();
  return app;
}

if (process.env.NODE_ENV !== 'test') {
  init()
    .then(() => start())
    .catch((err) => {
      console.error('Failed to start service', err);
      process.exit(1);
    });
}

export default app;
