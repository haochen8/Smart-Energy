import { Pool } from 'pg';
import type { AppConfig } from './config';

export interface RawReadingRow {
  ts: string;
  series_id: string;
  area: string;
  customer: string;
  price: number;
  payload: Record<string, unknown>;
}

export interface DecisionRow {
  ts: string;
  series_id: string;
  action_type: string;
  current_price: number;
  threshold: number;
  predicted_values: number[];
  predicted_spike: boolean;
  confidence_score: number;
  explanation: string;
}

export interface StreamStats {
  latestTimestamp: string | null;
  totalReadings: number;
}

export interface AreaLatestState {
  series_id: string;
  latest_reading: RawReadingRow;
  latest_decision: DecisionRow | null;
}

export interface AreaList {
  areas: string[];
}

const normalizeTimestamp = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date(value as string).toISOString();
};

export class TimescaleClient {
  private pool: Pool;

  constructor(config: AppConfig) {
    this.pool = new Pool({
      host: config.timescaleHost,
      port: config.timescalePort,
      database: config.timescaleDb,
      user: config.timescaleUser,
      password: config.timescalePassword,
      ssl: config.timescaleSsl ? { rejectUnauthorized: false } : undefined,
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getLatestState(seriesId: string): Promise<{ reading: RawReadingRow | null; decision: DecisionRow | null }> {
    const readingResult = await this.pool.query(
      `
        SELECT ts, series_id, area, customer, price, payload
        FROM raw_meter_readings
        WHERE series_id = $1
        ORDER BY ts DESC
        LIMIT 1
      `,
      [seriesId],
    );
    const decisionResult = await this.pool.query(
      `
        SELECT
          ts,
          series_id,
          action_type,
          current_price,
          threshold,
          predicted_values,
          predicted_spike,
          confidence_score,
          explanation
        FROM decisions
        WHERE series_id = $1
        ORDER BY ts DESC
        LIMIT 1
      `,
      [seriesId],
    );

    const readingRow = readingResult.rows[0]
      ? { ...readingResult.rows[0], ts: normalizeTimestamp(readingResult.rows[0].ts) }
      : null;
    const decisionRow = decisionResult.rows[0]
      ? { ...decisionResult.rows[0], ts: normalizeTimestamp(decisionResult.rows[0].ts) }
      : null;

    return { reading: readingRow, decision: decisionRow };
  }

  async getRawHistory(seriesId: string, start: Date, end: Date, limit: number): Promise<RawReadingRow[]> {
    const result = await this.pool.query(
      `
        SELECT ts, series_id, area, customer, price, payload
        FROM (
          SELECT DISTINCT ON (ts) ts, series_id, area, customer, price, payload
          FROM raw_meter_readings
          WHERE series_id = $1
            AND ts >= $2
            AND ts <= $3
          ORDER BY ts DESC
        ) AS deduped
        ORDER BY ts ASC
        LIMIT $4
      `,
      [seriesId, start, end, limit],
    );
    return result.rows.map((row) => ({ ...row, ts: normalizeTimestamp(row.ts) }));
  }

  async getDecisionHistory(seriesId: string, start: Date, end: Date, limit: number): Promise<DecisionRow[]> {
    const result = await this.pool.query(
      `
        SELECT
          ts,
          series_id,
          action_type,
          current_price,
          threshold,
          predicted_values,
          predicted_spike,
          confidence_score,
          explanation
        FROM (
          SELECT DISTINCT ON (ts)
            ts,
            series_id,
            action_type,
            current_price,
            threshold,
            predicted_values,
            predicted_spike,
            confidence_score,
            explanation
          FROM decisions
          WHERE series_id = $1
            AND ts >= $2
            AND ts <= $3
          ORDER BY ts DESC
        ) AS deduped
        ORDER BY ts ASC
        LIMIT $4
      `,
      [seriesId, start, end, limit],
    );
    return result.rows.map((row) => ({ ...row, ts: normalizeTimestamp(row.ts) }));
  }

  async getLatestByArea(area: string, limit: number): Promise<AreaLatestState[]> {
    const readingsResult = await this.pool.query(
      `
        SELECT DISTINCT ON (series_id) ts, series_id, area, customer, price, payload
        FROM raw_meter_readings
        WHERE area = $1
        ORDER BY series_id, ts DESC
        LIMIT $2
      `,
      [area, limit],
    );
    const readings = readingsResult.rows.map((row) => ({ ...row, ts: normalizeTimestamp(row.ts) })) as RawReadingRow[];
    if (!readings.length) return [];

    const seriesIds = readings.map((row) => row.series_id);
    const decisionsResult = await this.pool.query(
      `
        SELECT DISTINCT ON (series_id)
          ts,
          series_id,
          action_type,
          current_price,
          threshold,
          predicted_values,
          predicted_spike,
          confidence_score,
          explanation
        FROM decisions
        WHERE series_id = ANY($1)
        ORDER BY series_id, ts DESC
      `,
      [seriesIds],
    );
    const decisions = decisionsResult.rows.map((row) => ({ ...row, ts: normalizeTimestamp(row.ts) })) as DecisionRow[];
    const decisionBySeries = new Map(decisions.map((row) => [row.series_id, row]));

    return readings.map((reading) => ({
      series_id: reading.series_id,
      latest_reading: reading,
      latest_decision: decisionBySeries.get(reading.series_id) ?? null,
    }));
  }

  async getAreas(): Promise<AreaList> {
    const result = await this.pool.query(
      `
        SELECT DISTINCT area
        FROM raw_meter_readings
        WHERE area IS NOT NULL
          AND area <> ''
        ORDER BY area ASC
      `,
    );
    const areas = result.rows.map((row) => row.area).filter((area) => typeof area === 'string' && area.trim());
    return { areas };
  }

  async getStreamStats(): Promise<StreamStats> {
    const result = await this.pool.query(
      `
        SELECT
          MAX(ts) AS latest_ts,
          COUNT(*)::bigint AS total_readings
        FROM raw_meter_readings
      `,
    );
    const row = result.rows[0] ?? {};
    return {
      latestTimestamp: row.latest_ts ? normalizeTimestamp(row.latest_ts) : null,
      totalReadings: Number(row.total_readings ?? 0),
    };
  }
}
