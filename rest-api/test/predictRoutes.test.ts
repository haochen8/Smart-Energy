import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

test('POST /v1/predict validates AREA or series_id', async () => {
  process.env.API_KEY = 'test-key';
  const { createApp } = await import('../src/app');
  const app = createApp(null, {
    predictionClient: {
      predict: async () => ({}),
      predictSpotPrice: async () => ({}),
    } as any,
  });
  const res = await request(app).post('/v1/predict').set('X-API-Key', 'test-key').send({});
  assert.equal(res.status, 400);
});

test('POST /v1/predict proxies to algorithm processor', async () => {
  process.env.API_KEY = 'test-key';
  const { createApp } = await import('../src/app');
  const app = createApp(null, {
    predictionClient: {
      predict: async () => ({ predicted_price: 12.3 }),
      predictSpotPrice: async () => ({}),
    } as any,
  });
  const res = await request(app)
    .post('/v1/predict')
    .set('X-API-Key', 'test-key')
    .send({ AREA: 'Berga', records: [{ DateTime: '2025-01-01T00:00:00Z', price: 10, AREA: 'Berga' }] });
  assert.equal(res.status, 200);
  assert.equal(res.body.predicted_price, 12.3);
});

test('POST /v1/predict uses Timescale history when records are missing', async () => {
  process.env.API_KEY = 'test-key';
  const { createApp } = await import('../src/app');
  const dbMock = {
    getRawHistory: async () => [
      { ts: '2025-01-01T00:00:00Z', series_id: 'series-1', area: 'Berga', customer: 'A', price: 10, payload: {} },
      { ts: '2025-01-01T01:00:00Z', series_id: 'series-1', area: 'Berga', customer: 'A', price: 11, payload: {} },
    ],
    getDecisionHistory: async () => [],
    getLatestState: async () => ({
      reading: { ts: '2025-01-01T01:00:00Z', series_id: 'series-1', area: 'Berga', customer: 'A', price: 11, payload: {} },
      decision: null,
    }),
    getLatestByArea: async () => [],
  } as any;
  const app = createApp(dbMock, {
    predictionClient: {
      predict: async () => ({ predicted_price: 12.3 }),
      predictSpotPrice: async () => ({}),
    } as any,
  });
  const res = await request(app)
    .post('/v1/predict')
    .set('X-API-Key', 'test-key')
    .send({ series_id: 'series-1', start: '2025-01-01T00:00:00Z', end: '2025-01-02T00:00:00Z' });
  assert.equal(res.status, 200);
  assert.equal(res.body.predicted_price, 12.3);
});

test('POST /v1/predict surfaces upstream error', async () => {
  process.env.API_KEY = 'test-key';
  const { createApp } = await import('../src/app');
  const { AlgorithmProcessorHttpError } = await import('../src/algorithmProcessorClient');
  const app = createApp(null, {
    predictionClient: {
      predict: async () => {
        throw new AlgorithmProcessorHttpError(400, { error: 'Bad request' });
      },
      predictSpotPrice: async () => ({}),
    } as any,
  });
  const res = await request(app)
    .post('/v1/predict')
    .set('X-API-Key', 'test-key')
    .send({ AREA: 'Berga', records: [{ DateTime: '2025-01-01T00:00:00Z', price: 10, AREA: 'Berga' }] });
  assert.equal(res.status, 400);
});

test('POST /v1/predict fails when Timescale query fails', async () => {
  process.env.API_KEY = 'test-key';
  const { createApp } = await import('../src/app');
  const dbMock = {
    getRawHistory: async () => {
      throw new Error('db down');
    },
    getDecisionHistory: async () => [],
    getLatestState: async () => ({ reading: null, decision: null }),
    getLatestByArea: async () => [],
  } as any;
  const app = createApp(dbMock, {
    predictionClient: {
      predict: async () => ({ predicted_price: 12.3 }),
      predictSpotPrice: async () => ({}),
    } as any,
  });
  const res = await request(app)
    .post('/v1/predict')
    .set('X-API-Key', 'test-key')
    .send({ series_id: 'series-1', start: '2025-01-01T00:00:00Z', end: '2025-01-02T00:00:00Z' });
  assert.equal(res.status, 502);
});

test('POST /v1/predict/spot-price validates records', async () => {
  process.env.API_KEY = 'test-key';
  const { createApp } = await import('../src/app');
  const dbMock = {
    getRawHistory: async () => [],
    getDecisionHistory: async () => [],
    getLatestState: async () => ({ reading: null, decision: null }),
    getLatestByArea: async () => [],
  } as any;
  const app = createApp(dbMock, {
    predictionClient: {
      predict: async () => ({}),
      predictSpotPrice: async () => ({}),
    } as any,
  });
  const res = await request(app).post('/v1/predict/spot-price').set('X-API-Key', 'test-key').send({});
  assert.equal(res.status, 400);
});
