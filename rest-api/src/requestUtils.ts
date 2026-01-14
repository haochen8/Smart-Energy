import type { RawReadingRow } from './db';

export type PredictionRecord = {
  DateTime: string;
  price: number;
  AREA: string;
};

const recordKeys = ['records', 'data', 'historical_data', 'data_points'] as const;

export function parseSeriesId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

export function parseArea(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

export function resolveAreaFromPayload(payload: Record<string, unknown>): string | null {
  const areaRaw = payload['AREA'] ?? payload['area'] ?? payload['Area'];
  if (typeof areaRaw !== 'string') return null;
  const trimmed = areaRaw.trim();
  return trimmed ? trimmed : null;
}

export function resolveSeriesIdFromPayload(payload: Record<string, unknown>): string | null {
  const seriesRaw = payload['series_id'] ?? payload['seriesId'] ?? payload['SeriesId'];
  if (typeof seriesRaw !== 'string') return null;
  const trimmed = seriesRaw.trim();
  return trimmed ? trimmed : null;
}

export function extractRecordsFromPayload(payload: Record<string, unknown>): unknown[] | null {
  for (const key of recordKeys) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return null;
}

export function hasInlinePrediction(payload: Record<string, unknown>): boolean {
  const timestamp = payload['DateTime'] ?? payload['timestamp'] ?? payload['time'] ?? payload['date'];
  const price = payload['price'] ?? payload['Price'] ?? payload['spot_price'];
  return Boolean(timestamp && price !== undefined);
}

export function hasPredictionRecords(payload: Record<string, unknown>): boolean {
  const records = extractRecordsFromPayload(payload);
  if (Array.isArray(records) && records.length > 0) return true;
  return hasInlinePrediction(payload);
}

export function resolveAreaFromRecords(records: unknown[]): string | null {
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const areaRaw = (record as Record<string, unknown>)['AREA'] ?? (record as Record<string, unknown>)['area'];
    if (typeof areaRaw !== 'string') continue;
    const trimmed = areaRaw.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function parseDateValue(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function parseLimitValue(raw: unknown, maxLimit: number, defaultLimit: number): number {
  const parsed = typeof raw === 'string' ? Number(raw) : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(Math.floor(parsed), maxLimit);
}

export function toPredictionRecords(readings: RawReadingRow[], area: string): PredictionRecord[] {
  return readings.map((reading) => ({
    DateTime: reading.ts,
    price: reading.price,
    AREA: reading.area || area,
  }));
}
