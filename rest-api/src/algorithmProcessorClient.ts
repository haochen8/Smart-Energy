export class AlgorithmProcessorHttpError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Algorithm processor responded with status ${status}`);
  }
}

export class AlgorithmProcessorTimeoutError extends Error {
  constructor(message: string) {
    super(message);
  }
}

type FetchLike = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

export class AlgorithmProcessorClient {
  private baseUrl: string;

  constructor(
    baseUrl: string,
    private timeoutMs: number,
    private fetchImpl: FetchLike = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async predict(payload: Record<string, unknown>): Promise<unknown> {
    return this.request('/predict', payload);
  }

  async predictSpotPrice(payload: Record<string, unknown>): Promise<unknown> {
    return this.request('/predict/spot-price', payload);
  }

  private async request(path: string, payload: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json') ? await response.json() : await response.text();
      if (!response.ok) throw new AlgorithmProcessorHttpError(response.status, body);
      return body;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new AlgorithmProcessorTimeoutError(`Algorithm processor request exceeded ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
