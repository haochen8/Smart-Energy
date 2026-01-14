"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimescaleClient = void 0;
const pg_1 = require("pg");
const normalizeTimestamp = (value) => {
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === 'string')
        return value;
    return new Date(value).toISOString();
};
class TimescaleClient {
    constructor(config) {
        this.pool = new pg_1.Pool({
            host: config.timescaleHost,
            port: config.timescalePort,
            database: config.timescaleDb,
            user: config.timescaleUser,
            password: config.timescalePassword,
            ssl: config.timescaleSsl ? { rejectUnauthorized: false } : undefined,
        });
    }
    async ping() {
        try {
            await this.pool.query('SELECT 1');
            return true;
        }
        catch {
            return false;
        }
    }
    async close() {
        await this.pool.end();
    }
    async getLatestState(seriesId) {
        const readingResult = await this.pool.query(`
        SELECT ts, series_id, area, customer, price, payload
        FROM raw_meter_readings
        WHERE series_id = $1
        ORDER BY ts DESC
        LIMIT 1
      `, [seriesId]);
        const decisionResult = await this.pool.query(`
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
      `, [seriesId]);
        const readingRow = readingResult.rows[0]
            ? { ...readingResult.rows[0], ts: normalizeTimestamp(readingResult.rows[0].ts) }
            : null;
        const decisionRow = decisionResult.rows[0]
            ? { ...decisionResult.rows[0], ts: normalizeTimestamp(decisionResult.rows[0].ts) }
            : null;
        return { reading: readingRow, decision: decisionRow };
    }
    async getRawHistory(seriesId, start, end, limit) {
        const result = await this.pool.query(`
        SELECT ts, series_id, area, customer, price, payload
        FROM raw_meter_readings
        WHERE series_id = $1
          AND ts >= $2
          AND ts <= $3
        ORDER BY ts ASC
        LIMIT $4
      `, [seriesId, start, end, limit]);
        return result.rows.map((row) => ({ ...row, ts: normalizeTimestamp(row.ts) }));
    }
    async getDecisionHistory(seriesId, start, end, limit) {
        const result = await this.pool.query(`
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
          AND ts >= $2
          AND ts <= $3
        ORDER BY ts ASC
        LIMIT $4
      `, [seriesId, start, end, limit]);
        return result.rows.map((row) => ({ ...row, ts: normalizeTimestamp(row.ts) }));
    }
}
exports.TimescaleClient = TimescaleClient;
