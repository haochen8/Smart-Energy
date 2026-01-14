import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AlgorithmProcessorClient,
  AlgorithmProcessorHttpError,
  AlgorithmProcessorTimeoutError,
} from '../src/algorithmProcessorClient';

type FetchLike = ConstructorParameters<typeof AlgorithmProcessorClient>[2];

test('AlgorithmProcessorClient returns JSON on success', async () => {
  const fetchMock: FetchLike = async () =>
    ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
      text: async () => '',
    }) as unknown as Response;

  const client = new AlgorithmProcessorClient('http://example.test', 1000, fetchMock);
  const result = await client.predict({ AREA: 'Berga' });
  assert.deepEqual(result, { ok: true });
});

test('AlgorithmProcessorClient throws on non-2xx responses', async () => {
  const fetchMock: FetchLike = async () =>
    ({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Bad request' }),
      text: async () => '',
    }) as unknown as Response;

  const client = new AlgorithmProcessorClient('http://example.test', 1000, fetchMock);
  await assert.rejects(() => client.predict({ AREA: 'Berga' }), (err: unknown) => {
    assert.ok(err instanceof AlgorithmProcessorHttpError);
    assert.equal((err as AlgorithmProcessorHttpError).status, 400);
    return true;
  });
});

test('AlgorithmProcessorClient times out', async () => {
  const fetchMock: FetchLike = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject({ name: 'AbortError' }));
    });

  const client = new AlgorithmProcessorClient('http://example.test', 5, fetchMock);
  await assert.rejects(() => client.predict({ AREA: 'Berga' }), (err: unknown) => {
    assert.ok(err instanceof AlgorithmProcessorTimeoutError);
    return true;
  });
});
