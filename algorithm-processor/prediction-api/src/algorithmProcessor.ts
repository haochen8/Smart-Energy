import { parseISODate } from './dateUtils.js';
import type { Producer } from 'kafkajs';
import type { TimescaleWriter } from './timescaleWriter.js';

export interface PriceMessage {
  timestamp: Date;
  price: number;
  area: string;
  customer: string;
  raw: Record<string, unknown>;
}

export interface ForecastResult {
  predictedValues: number[];
  confidence: number;
  predictedSpike: boolean;
  explanation: string;
}

export interface DecisionResult {
  actionType: string;
  explanation: string;
  currentPrice: number;
  threshold: number;
  predictedValues: number[];
  predictedSpike: boolean;
  confidenceScore: number;
  timestamp: Date;
}

export type HistoryPoint = [Date, number];

function linearFit(points: number[]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  const x = points.map((_, idx) => idx);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = points.reduce((a, b) => a + b, 0);
  const sumXY = points.reduce((acc, y, idx) => acc + idx * y, 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);

  const denominator = n * sumX2 - sumX * sumX || 1e-9;
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate r2
  const fitted = points.map((_, idx) => intercept + slope * idx);
  const ssRes = points.reduce((acc, y, idx) => acc + Math.pow(y - fitted[idx], 2), 0);
  const meanY = sumY / n;
  const ssTot = points.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0) || 1e-6;
  const r2 = Math.max(0, Math.min(1, 1 - ssRes / ssTot));

  return { slope, intercept, r2 };
}

export class ShortTermForecaster {
  constructor(
    private spikeDeltaPct: number = 15.0,
    private minPoints: number = 12,
  ) {}

  predict(history: HistoryPoint[], horizonPoints: number): ForecastResult {
    const values = history.map(([, price]) => price).filter((price) => Number.isFinite(price));
    const lastPrice = values.at(-1) ?? 0;
    if (values.length < 2) {
      const predicted = Array.from({ length: horizonPoints }, () => Number(lastPrice.toFixed(2)));
      return { predictedValues: predicted, confidence: 0.1, predictedSpike: false, explanation: 'insufficient_history' };
    }

    const { slope, intercept, r2 } = linearFit(values);
    const future = Array.from({ length: horizonPoints }, (_, idx) => intercept + slope * (values.length + idx)).map(
      (v) => Number(v.toFixed(2)),
    );

    const spikeLevel = lastPrice * (1 + this.spikeDeltaPct / 100);
    const predictedSpike = future.some((p) => p >= spikeLevel);
    const sampleFactor = Math.min(1, values.length / this.minPoints);
    const confidenceRaw = 0.1 + 0.7 * r2 * sampleFactor;
    const confidence = Number(Math.max(0.05, Math.min(0.95, confidenceRaw)).toFixed(2));

    const explanation = `slope=${slope.toFixed(4)}, r2=${r2.toFixed(3)}, samples=${values.length}, sample_factor=${sampleFactor.toFixed(
      2,
    )}, last_price=${lastPrice.toFixed(2)}, spike_level=${spikeLevel.toFixed(2)}`;

    return { predictedValues: future, confidence, predictedSpike, explanation };
  }
}

export class DecisionEngine {
  constructor(
    private priceThreshold: number,
    private lowPriceThreshold: number,
    private offpeakHours: Array<[number, number]>,
  ) {}

  private isOffpeak(ts: Date): boolean {
    const hour = ts.getHours();
    return this.offpeakHours.some(([start, end]) => start <= hour && hour <= end);
  }

  decide(message: PriceMessage, forecast: ForecastResult): DecisionResult {
    const now = message.timestamp;
    const currentPrice = message.price;

    let actionType: string;
    let explanation: string;
    if (currentPrice >= this.priceThreshold) {
      actionType = 'CRITICAL_NOW';
      explanation = `Current price ${currentPrice} >= threshold ${this.priceThreshold}; reduce usage immediately.`;
    } else if (forecast.predictedSpike) {
      actionType = 'PREPARE_FOR_SPIKE';
      const peak = forecast.predictedValues.length ? Math.max(...forecast.predictedValues) : currentPrice;
      explanation = `Predicted spike with forecast peak ${peak.toFixed(2)} (>${currentPrice}); pre-charge or adjust before spike.`;
    } else if (currentPrice <= this.lowPriceThreshold && this.isOffpeak(now)) {
      actionType = 'OPPORTUNITY_CHARGE';
      explanation = `Price ${currentPrice} is low and off-peak hour ${now.getHours()}; charge/pre-heat now.`;
    } else {
      actionType = 'NORMAL_OPERATION';
      explanation = 'No spike predicted and price not critically high; run baseline schedule.';
    }

    return {
      actionType,
      explanation,
      currentPrice,
      threshold: this.priceThreshold,
      predictedValues: forecast.predictedValues,
      predictedSpike: forecast.predictedSpike,
      confidenceScore: forecast.confidence,
      timestamp: now,
    };
  }
}

export class StoragePublisher {
  constructor(
    private redisClient?: any,
    private producer?: Producer,
    private targetTopic?: string,
  ) {}

  async store(seriesId: string, decision: DecisionResult): Promise<void> {
    if (!this.redisClient) return;
    const key = `decisions:${seriesId}:${decision.timestamp.toISOString()}`;
    const payload = this.serialize(decision);
    try {
      await this.redisClient.set(key, JSON.stringify(payload));
    } catch (err) {
      console.warn('Failed to store decision', err);
    }
  }

  async publish(decision: DecisionResult): Promise<void> {
    if (!this.producer || !this.targetTopic) return;
    const payload = JSON.stringify(this.serialize(decision));
    try {
      await this.producer.send({ topic: this.targetTopic, messages: [{ value: payload }] });
    } catch (err) {
      console.warn('Failed to publish decision', err);
    }
  }

  private serialize(decision: DecisionResult) {
    return {
      actionType: decision.actionType,
      currentPrice: decision.currentPrice,
      threshold: decision.threshold,
      predictedValues: decision.predictedValues,
      predictedSpike: decision.predictedSpike,
      confidenceScore: decision.confidenceScore,
      timestamp: decision.timestamp.toISOString(),
      explanation: decision.explanation,
    };
  }
}

export class AlgorithmProcessor {
  constructor(
    private forecaster: ShortTermForecaster,
    private decisionEngine: DecisionEngine,
    private storagePublisher: StoragePublisher,
    private redisClient?: any,
    private historyLookback: number = 48,
    private timescaleWriter?: TimescaleWriter,
    private minHistoryPoints: number = 12,
  ) {}

  private resolveSeriesId(message: PriceMessage): string {
    const raw = message.raw;
    const meterId = raw['meter_id'] ?? raw['meterId'] ?? raw['meter'];
    if (typeof meterId === 'string' && meterId.trim()) return meterId.trim();
    if (typeof meterId === 'number' && Number.isFinite(meterId)) return String(meterId);
    return `${message.area}:${message.customer ?? 'unknown'}`;
  }

  parseMessage(raw: Record<string, unknown>): PriceMessage {
    const tsRaw = (raw['DateTime'] || raw['timestamp'] || raw['time']) as string | undefined;
    const priceRaw = (raw['Price'] || raw['price'] || raw['spot_price']) as unknown;
    const areaRaw = (raw['AREA'] || raw['area']) as string | undefined;
    const area = areaRaw?.trim() || 'unknown';
    const customerRaw = (raw['CUSTOMER'] || raw['customer']) as string | undefined;
    const customer = customerRaw?.trim() || 'unknown';

    if (priceRaw === undefined || priceRaw === null) throw new Error('Missing price in message');
    const price = Number(priceRaw);
    if (!Number.isFinite(price)) throw new Error(`Invalid price value: ${priceRaw}`);

    const ts = parseISODate(tsRaw) ?? new Date();
    return { timestamp: ts, price, area, customer, raw };
  }

  private async fetchHistory(seriesId: string): Promise<HistoryPoint[]> {
    if (!this.redisClient) return [];
    const timelineKey = `timeline:${seriesId}`;
    const rangeEnd = Math.max(this.historyLookback - 1, 0);
    const timestamps = await this.redisClient.zRange(timelineKey, 0, rangeEnd, { REV: true });
    const history: HistoryPoint[] = [];
    for (const ts of timestamps.reverse()) {
      const pointKey = `timeseries:${seriesId}:${ts}`;
      const data = await this.redisClient.get(pointKey);
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        const price = Number(parsed.price ?? parsed.value);
        const date = parseISODate(parsed.timestamp);
        if (Number.isFinite(price) && date) history.push([date, price]);
      } catch (err) {
        continue;
      }
    }
    return history;
  }

  private async storeHistoryPoint(seriesId: string, message: PriceMessage): Promise<boolean> {
    if (!this.redisClient) return false;
    const timestamp = message.timestamp.toISOString();
    const pointKey = `timeseries:${seriesId}:${timestamp}`;
    const payload = {
      timestamp,
      price: message.price,
      area: message.area,
      customer: message.customer,
      series_id: seriesId,
    };
    try {
      await this.redisClient.set(pointKey, JSON.stringify(payload));
      const score = message.timestamp.getTime() / 1000;
      await this.redisClient.zAdd(`timeline:${seriesId}`, [{ score, value: timestamp }]);
      return true;
    } catch (err) {
      console.warn('Failed to store history in Redis', err);
      return false;
    }
  }

  async process(rawMessage: Record<string, unknown>): Promise<DecisionResult> {
    const message = this.parseMessage(rawMessage);
    const seriesId = this.resolveSeriesId(message);
    if (this.timescaleWriter) {
      try {
        await this.timescaleWriter.storeRaw(message);
      } catch (err) {
        console.warn('Failed to store raw message in TimescaleDB', err);
      }
    }
    const storedInRedis = await this.storeHistoryPoint(seriesId, message);
    const history = await this.fetchHistory(seriesId);
    if (!storedInRedis) {
      history.push([message.timestamp, message.price]);
    }
    if (history.length < this.minHistoryPoints) {
      throw new Error(
        `Insufficient history for series ${seriesId}. Need ${this.minHistoryPoints} points, have ${history.length}.`,
      );
    }

    const forecast = this.forecaster.predict(history.slice(-this.historyLookback), 4);
    const decision = this.decisionEngine.decide(message, forecast);

    await this.storagePublisher.store(seriesId, decision);
    await this.storagePublisher.publish(decision);
    if (this.timescaleWriter) {
      try {
        await this.timescaleWriter.storeDecision({
          seriesId,
          timestamp: decision.timestamp,
          actionType: decision.actionType,
          currentPrice: decision.currentPrice,
          threshold: decision.threshold,
          predictedValues: decision.predictedValues,
          predictedSpike: decision.predictedSpike,
          confidenceScore: decision.confidenceScore,
          explanation: decision.explanation,
        });
      } catch (err) {
        console.warn('Failed to store decision in TimescaleDB', err);
      }
    }

    return decision;
  }
}
