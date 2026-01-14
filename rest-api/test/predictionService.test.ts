import assert from 'node:assert/strict';
import test from 'node:test';
import { PredictionDependencyError, PredictionService, PredictionValidationError, type PredictionClient } from '../src/predictionService';
import type { TimescaleClient } from '../src/db';

test('PredictionService uses Timescale history when records are missing', async () => {
  const dbMock = {
    getRawHistory: async () => [
      { ts: '2025-01-01T00:00:00Z', series_id: 'series-1', area: 'Berga', customer: 'A', price: 12.5, payload: {} },
      { ts: '2025-01-01T01:00:00Z', series_id: 'series-1', area: 'Berga', customer: 'A', price: 13.5, payload: {} },
    ],
    getDecisionHistory: async () => [],
    getLatestState: async () => ({
      reading: { ts: '2025-01-01T01:00:00Z', series_id: 'series-1', area: 'Berga', customer: 'A', price: 13.5, payload: {} },
      decision: null,
    }),
    getLatestByArea: async () => [],
  } as unknown as TimescaleClient;

  const calls: Record<string, unknown>[] = [];
  const clientMock: PredictionClient = {
    predict: async (payload: Record<string, unknown>) => {
      calls.push(payload);
      return { ok: true };
    },
    predictSpotPrice: async () => ({ ok: true }),
  };

  const service = new PredictionService(clientMock, dbMock, 1000);
  await service.predict({
    series_id: 'series-1',
    start: '2025-01-01T00:00:00Z',
    end: '2025-01-02T00:00:00Z',
  });

  assert.equal(calls.length, 1);
  const payload = calls[0];
  assert.ok(Array.isArray(payload.records));
  assert.equal((payload.records as any[]).length, 2);
});

test('PredictionService validates missing AREA or series_id when records are absent', async () => {
  const dbMock = {
    getRawHistory: async () => [],
    getDecisionHistory: async () => [],
    getLatestState: async () => ({ reading: null, decision: null }),
    getLatestByArea: async () => [],
  } as unknown as TimescaleClient;

  const clientMock: PredictionClient = {
    predict: async () => ({ ok: true }),
    predictSpotPrice: async () => ({ ok: true }),
  };

  const service = new PredictionService(clientMock, dbMock, 1000);
  await assert.rejects(() => service.predict({}), (err: unknown) => {
    assert.ok(err instanceof PredictionValidationError);
    return true;
  });
});

test('PredictionService reports dependency error when Timescale is missing', async () => {
  const clientMock: PredictionClient = {
    predict: async () => ({ ok: true }),
    predictSpotPrice: async () => ({ ok: true }),
  };

  const service = new PredictionService(clientMock, null, 1000);
  await assert.rejects(() => service.predict({ series_id: 'series-1' }), (err: unknown) => {
    assert.ok(err instanceof PredictionDependencyError);
    return true;
  });
});
