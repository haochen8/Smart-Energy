import request from 'supertest';

process.env.ENABLE_STREAM_CONSUMER = 'false';

let app: typeof import('../src/app.js').default;
let initForTest: () => Promise<typeof import('../src/app.js').default>;

beforeAll(async () => {
  const mod = await import('../src/app.js');
  app = mod.default;
  initForTest = mod.initForTest;
  await initForTest();
});

describe('API basics', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
  });

  it('handles stateless prediction when redis is missing', async () => {
    const base = Date.now() - 12 * 60 * 60 * 1000;
    const records = Array.from({ length: 12 }, (_, idx) => ({
      DateTime: new Date(base + idx * 60 * 60 * 1000).toISOString(),
      price: 50 + idx,
      AREA: 'Berga',
    }));
    const res = await request(app).post('/predict').send({ AREA: 'Berga', records });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('predicted_price');
  });
});
