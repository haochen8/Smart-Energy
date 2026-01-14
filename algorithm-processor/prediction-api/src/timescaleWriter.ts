import { Pool } from 'pg';

export interface TimescaleConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  enableRetention: boolean;
  retentionDays: number;
}

export interface RawReading {
  timestamp: Date;
  price: number;
  area: string;
  customer: string;
  raw: Record<string, unknown>;
}

export interface DecisionRecord {
  seriesId: string;
  timestamp: Date;
  actionType: string;
  currentPrice: number;
  threshold: number;
  predictedValues: number[];
  predictedSpike: boolean;
  confidenceScore: number;
  explanation: string;
}

export class TimescaleWriter {
  private pool: Pool;

  constructor(private config: TimescaleConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    });
  }

  private resolveSeriesId(reading: RawReading): string {
    const raw = reading.raw;
    const meterId = raw['meter_id'] ?? raw['meterId'] ?? raw['meter'];
    if (typeof meterId === 'string' && meterId.trim()) return meterId.trim();
    if (typeof meterId === 'number' && Number.isFinite(meterId)) return String(meterId);
    return `${reading.area}:${reading.customer}`;
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS timescaledb');
      await client.query(`
        CREATE TABLE IF NOT EXISTS raw_meter_readings (
          ts TIMESTAMPTZ NOT NULL,
          series_id TEXT NOT NULL,
          area TEXT NOT NULL,
          customer TEXT NOT NULL,
          price DOUBLE PRECISION NOT NULL,
          payload JSONB NOT NULL
        )
      `);
      await client.query(`
        SELECT create_hypertable('raw_meter_readings', 'ts', if_not_exists => TRUE)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS raw_meter_readings_series_ts_idx
        ON raw_meter_readings (series_id, ts DESC)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS raw_meter_readings_area_series_ts_idx
        ON raw_meter_readings (area, series_id, ts DESC)
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS decisions (
          ts TIMESTAMPTZ NOT NULL,
          series_id TEXT NOT NULL,
          action_type TEXT NOT NULL,
          current_price DOUBLE PRECISION NOT NULL,
          threshold DOUBLE PRECISION NOT NULL,
          predicted_values DOUBLE PRECISION[] NOT NULL,
          predicted_spike BOOLEAN NOT NULL,
          confidence_score DOUBLE PRECISION NOT NULL,
          explanation TEXT NOT NULL
        )
      `);
      await client.query(`
        SELECT create_hypertable('decisions', 'ts', if_not_exists => TRUE)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS decisions_series_ts_idx
        ON decisions (series_id, ts DESC)
      `);
      if (this.config.enableRetention && this.config.retentionDays > 0) {
        await client.query(
          `SELECT add_retention_policy('raw_meter_readings', INTERVAL '${this.config.retentionDays} days', if_not_exists => TRUE)`,
        );
        await client.query(
          `SELECT add_retention_policy('decisions', INTERVAL '${this.config.retentionDays} days', if_not_exists => TRUE)`,
        );
      }
    } finally {
      client.release();
    }
  }

  async storeRaw(reading: RawReading): Promise<void> {
    const seriesId = this.resolveSeriesId(reading);
    await this.pool.query(
      `
        INSERT INTO raw_meter_readings (ts, series_id, area, customer, price, payload)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [reading.timestamp, seriesId, reading.area, reading.customer, reading.price, reading.raw],
    );
  }

  async storeDecision(record: DecisionRecord): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO decisions (
          ts,
          series_id,
          action_type,
          current_price,
          threshold,
          predicted_values,
          predicted_spike,
          confidence_score,
          explanation
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        record.timestamp,
        record.seriesId,
        record.actionType,
        record.currentPrice,
        record.threshold,
        record.predictedValues,
        record.predictedSpike,
        record.confidenceScore,
        record.explanation,
      ],
    );
  }
}
