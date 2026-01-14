import type { AlgorithmProcessorClient } from './algorithmProcessorClient';
import { TimescaleClient, type AreaLatestState, type DecisionRow, type RawReadingRow } from './db';
import {
  extractRecordsFromPayload,
  hasInlinePrediction,
  parseDateValue,
  parseLimitValue,
  resolveAreaFromPayload,
  resolveAreaFromRecords,
  resolveSeriesIdFromPayload,
  toPredictionRecords,
  type PredictionRecord,
} from './requestUtils';

export class PredictionValidationError extends Error {
  constructor(
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export class PredictionDependencyError extends Error {
  constructor(
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export type PredictionClient = Pick<AlgorithmProcessorClient, 'predict' | 'predictSpotPrice'>;

type TimescaleContext = {
  latest_state?: { reading: RawReadingRow | null; decision: DecisionRow | null };
  raw_history?: RawReadingRow[];
  decision_history?: DecisionRow[];
  latest_by_area?: AreaLatestState[];
};

type TimescaleQueryInput = {
  start?: Date;
  end?: Date;
  limit: number;
  seriesId?: string;
  area?: string;
};

export class PredictionService {
  constructor(
    private predictionClient: PredictionClient,
    private db: TimescaleClient | null,
    private maxHistoryLimit: number,
  ) {}

  async predict(payload: Record<string, unknown>): Promise<unknown> {
    const area = resolveAreaFromPayload(payload);
    const seriesId = resolveSeriesIdFromPayload(payload);
    if (!area && !seriesId) throw new PredictionValidationError('AREA or series_id is required for prediction');
    const hydratedPayload = await this.ensurePayloadWithRecords(payload, area, seriesId, true);
    return this.predictionClient.predict(hydratedPayload);
  }

  async predictSpotPrice(payload: Record<string, unknown>): Promise<unknown> {
    const area = resolveAreaFromPayload(payload);
    const seriesId = resolveSeriesIdFromPayload(payload);
    const hydratedPayload = await this.ensurePayloadWithRecords(payload, area, seriesId, false);
    return this.predictionClient.predictSpotPrice(hydratedPayload);
  }

  private parseTimescaleInput(payload: Record<string, unknown>): TimescaleQueryInput {
    const hasStart = 'start' in payload;
    const hasEnd = 'end' in payload;
    const start = parseDateValue(payload['start']);
    const end = parseDateValue(payload['end']);
    if (hasStart || hasEnd) {
      if (!start || !end) {
        throw new PredictionValidationError('start and end must be valid ISO timestamps');
      }
      if (start > end) throw new PredictionValidationError('start must be before end');
    }
    const defaultLimit = Math.min(500, this.maxHistoryLimit);
    const limit = parseLimitValue(payload['limit'], this.maxHistoryLimit, defaultLimit);
    return { start: start ?? undefined, end: end ?? undefined, limit };
  }

  private async ensurePayloadWithRecords(
    payload: Record<string, unknown>,
    area: string | null,
    seriesId: string | null,
    includeDecisionHistory: boolean,
  ): Promise<Record<string, unknown>> {
    const records = extractRecordsFromPayload(payload);
    if (Array.isArray(records) && records.length > 0) {
      let inferredArea = area ?? resolveAreaFromRecords(records);
      if (!inferredArea && seriesId && this.db) {
        const latestState = await this.db.getLatestState(seriesId);
        inferredArea = latestState.reading?.area ?? null;
      }
      if (!inferredArea) {
        throw new PredictionValidationError('AREA is required for prediction');
      }
      return { ...payload, AREA: inferredArea };
    }
    if (hasInlinePrediction(payload)) {
      if (!area && seriesId && this.db) {
        const latestState = await this.db.getLatestState(seriesId);
        const inferredArea = latestState.reading?.area ?? null;
        if (inferredArea) {
          return { ...payload, AREA: inferredArea };
        }
      }
      if (!area) {
        throw new PredictionValidationError('AREA is required for prediction');
      }
      return payload;
    }

    if (records && records.length === 0 && !('start' in payload) && !('end' in payload) && !('limit' in payload)) {
      throw new PredictionValidationError('records must be a non-empty list');
    }

    if (!this.db) throw new PredictionDependencyError('TimescaleDB not available for prediction history');

    const queryInput = this.parseTimescaleInput(payload);
    queryInput.seriesId = seriesId ?? undefined;
    queryInput.area = area ?? undefined;
    const { records: timescaleRecords, context, resolvedArea } = await this.loadTimescaleRecords(
      queryInput,
      includeDecisionHistory,
    );

    if (!timescaleRecords.length) {
      throw new PredictionValidationError('No historical data found for prediction', {
        area: resolvedArea ?? area ?? null,
        series_id: seriesId ?? null,
      });
    }

    const nextPayload: Record<string, unknown> = {
      ...payload,
      AREA: resolvedArea ?? area,
      records: timescaleRecords,
    };

    if (payload['include_context'] && context) {
      nextPayload.timescale_context = context;
    }

    return nextPayload;
  }

  private async loadTimescaleRecords(
    queryInput: TimescaleQueryInput,
    includeDecisionHistory: boolean,
  ): Promise<{ records: PredictionRecord[]; context?: TimescaleContext; resolvedArea?: string }> {
    const context: TimescaleContext = {};
    const resolvedArea = queryInput.area;

    try {
      if (queryInput.start && queryInput.end) {
        if (!queryInput.seriesId) {
          throw new PredictionValidationError('series_id is required when start/end are provided');
        }
        const tasks = [
          this.db!.getRawHistory(queryInput.seriesId, queryInput.start, queryInput.end, queryInput.limit),
          this.db!.getLatestState(queryInput.seriesId),
        ] as const;
        const [rawHistory, latestState] = await Promise.all(tasks);
        context.raw_history = rawHistory;
        context.latest_state = latestState;

        if (includeDecisionHistory) {
          context.decision_history = await this.db!.getDecisionHistory(
            queryInput.seriesId,
            queryInput.start,
            queryInput.end,
            queryInput.limit,
          );
        }

        const inferredArea = resolvedArea ?? latestState.reading?.area ?? rawHistory[0]?.area;
        if (!inferredArea) {
          throw new PredictionValidationError('AREA is required when records are not provided');
        }
        let records = toPredictionRecords(rawHistory, inferredArea);
        if (!records.length && latestState.reading) {
          records = toPredictionRecords([latestState.reading], inferredArea);
        }
        return { records, context, resolvedArea: inferredArea };
      }

      const tasks: Array<Promise<unknown>> = [];
      if (queryInput.area) {
        tasks.push(this.db!.getLatestByArea(queryInput.area, queryInput.limit));
      }
      if (queryInput.seriesId) {
        tasks.push(this.db!.getLatestState(queryInput.seriesId));
      }
      const results = await Promise.all(tasks);
      const latestByArea = queryInput.area ? (results.shift() as AreaLatestState[]) : [];
      const latestState = queryInput.seriesId
        ? (results.shift() as { reading: RawReadingRow | null; decision: DecisionRow | null })
        : null;

      if (latestByArea.length) {
        context.latest_by_area = latestByArea;
      }
      if (latestState) {
        context.latest_state = latestState;
      }

      const readings = latestByArea
        .map((entry) => entry.latest_reading)
        .sort((a, b) => a.ts.localeCompare(b.ts));
      const inferredArea =
        resolvedArea ?? latestState?.reading?.area ?? readings[0]?.area;
      if (!inferredArea) {
        throw new PredictionValidationError('AREA is required when records are not provided');
      }
      let records = toPredictionRecords(readings, inferredArea);
      if (!records.length && latestState?.reading) {
        records = toPredictionRecords([latestState.reading], inferredArea);
      }
      return { records, context, resolvedArea: inferredArea };
    } catch (err: any) {
      if (err instanceof PredictionValidationError) throw err;
      throw new PredictionDependencyError('Failed to fetch TimescaleDB prediction data', {
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}
