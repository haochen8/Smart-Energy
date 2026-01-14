import { parseISODate } from './dateUtils.js';

export interface PredictionResult {
  predictedPrice: number;
  confidence: number;
  trend: string;
  changePct: number;
  volatility: number;
  horizonMinutes: number;
  lookbackUsed: number;
  explanation: string;
  recommendation: Record<string, unknown>;
  supportingPoints: number;
  intervalMinutes?: number;
}

interface NormalizedRecord {
  timestamp: Date;
  price: number;
  raw: Record<string, unknown>;
}

export class SpotPricePredictor {
  constructor(private lookback: number = 24, private minPoints: number = 12) {}

  private parseTimestamp(raw: unknown): Date | null {
    if (raw === null || raw === undefined) return null;
    if (raw instanceof Date) return raw;
    if (typeof raw === 'number') return new Date(raw * 1000);
    return parseISODate(String(raw)) || null;
  }

  private normalizeRecords(records: Array<Record<string, unknown>>): NormalizedRecord[] {
    const normalized: NormalizedRecord[] = [];
    for (const record of records) {
      const priceRaw = record['Price'] ?? record['price'] ?? record['spot_price'];
      const tsRaw = record['DateTime'] ?? record['timestamp'] ?? record['time'] ?? record['date'];
      const ts = this.parseTimestamp(tsRaw as unknown);
      if (ts === null || priceRaw === null || priceRaw === undefined) continue;
      const price = Number(priceRaw);
      if (!Number.isFinite(price)) continue;
      normalized.push({ timestamp: ts, price, raw: record });
    }
    return normalized.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private medianIntervalMinutes(timestamps: Date[]): number | null {
    if (timestamps.length < 2) return null;
    const deltas: number[] = [];
    for (let i = 0; i < timestamps.length - 1; i++) {
      const delta = (timestamps[i + 1].getTime() - timestamps[i].getTime()) / 60000;
      if (delta > 0) deltas.push(delta);
    }
    if (!deltas.length) return null;
    deltas.sort((a, b) => a - b);
    const mid = Math.floor(deltas.length / 2);
    if (deltas.length % 2 === 0) return (deltas[mid - 1] + deltas[mid]) / 2;
    return deltas[mid];
  }

  private deriveRecommendation(changePct: number, horizonMinutes: number): Record<string, unknown> {
    let action: string;
    let note: string;
    if (changePct >= 7) {
      action = 'reduce_now';
      note = 'Prices expected to spike; shift discretionary loads.';
    } else if (changePct >= 3) {
      action = 'preemptive_reduce';
      note = 'Upward trend detected; ramp down flexible usage soon.';
    } else if (changePct <= -7) {
      action = 'increase_now';
      note = 'Prices expected to drop; charge or pre-heat while cheap.';
    } else if (changePct <= -3) {
      action = 'opportunistic_use';
      note = 'Mild decrease expected; consider advancing demand.';
    } else {
      action = 'hold';
      note = 'Flat outlook; run baseline schedule.';
    }
    return {
      action,
      window_minutes: horizonMinutes,
      note,
      thresholds: {
        increase_pct: -3,
        reduce_pct: 3,
      },
    };
  }

  predict(records: Array<Record<string, unknown>>, horizonMinutes: number = 60): PredictionResult {
    const cleaned = this.normalizeRecords(records);
    if (cleaned.length < this.minPoints) {
      throw new Error(`Not enough data points for prediction. Got ${cleaned.length}, need at least ${this.minPoints}.`);
    }

    const window = cleaned.slice(-this.lookback);
    const prices = window.map((item) => item.price);
    const timestamps = window.map((item) => item.timestamp);
    const intervalMinutes = this.medianIntervalMinutes(timestamps) ?? 60;

    const n = prices.length;
    const x = prices.map((_, idx) => idx);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = prices.reduce((a, b) => a + b, 0);
    const sumXY = prices.reduce((acc, y, idx) => acc + idx * y, 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
    const denom = n * sumX2 - sumX * sumX || 1e-9;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const stepsAhead = Math.max(1, Math.ceil(horizonMinutes / intervalMinutes));
    const predicted = intercept + slope * (n - 1 + stepsAhead);

    const fitted = x.map((idx) => intercept + slope * idx);
    const residuals = prices.map((price, idx) => price - fitted[idx]);
    const ssRes = residuals.reduce((acc, r) => acc + r * r, 0);
    const meanPrice = prices.reduce((a, b) => a + b, 0) / n;
    const ssTot = prices.reduce((acc, p) => acc + Math.pow(p - meanPrice, 2), 0) || 1e-6;
    const rSquared = Math.max(0, Math.min(0.99, 1 - ssRes / ssTot));

    const volatility = Math.sqrt(residuals.reduce((acc, r) => acc + r * r, 0) / residuals.length);
    const stability = 1 / (1 + volatility);
    const horizonPenalty = 1 / (1 + (stepsAhead - 1) * 0.4);
    const confidence = Math.max(0.05, Math.min(0.98, rSquared * 0.6 + stability * 0.3 + horizonPenalty * 0.1));

    const lastPrice = prices[prices.length - 1];
    const changePct = lastPrice ? ((predicted - lastPrice) / lastPrice) * 100 : 0;
    const trend = slope > 0.05 ? 'up' : slope < -0.05 ? 'down' : 'flat';
    const recommendation = this.deriveRecommendation(changePct, horizonMinutes);
    const explanation = `Trend=${trend}, slope=${slope.toFixed(4)}, R2=${rSquared.toFixed(
      3,
    )}, interval=${intervalMinutes.toFixed(1)}m, horizon_steps=${stepsAhead}`;

    return {
      predictedPrice: Number(predicted.toFixed(2)),
      confidence: Number(confidence.toFixed(2)),
      trend,
      changePct: Number(changePct.toFixed(2)),
      volatility: Number(volatility.toFixed(3)),
      horizonMinutes,
      lookbackUsed: window.length,
      explanation,
      recommendation,
      supportingPoints: window.length,
      intervalMinutes,
    };
  }
}
