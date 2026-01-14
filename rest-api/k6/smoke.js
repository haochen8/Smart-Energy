import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://194.47.171.153';
const API_KEY = __ENV.API_KEY || '';
const INSECURE = (__ENV.INSECURE || 'true').toLowerCase() === 'true';

export const options = {
  vus: 1,
  iterations: 5,
  insecureSkipTLSVerify: INSECURE,
};

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  if (API_KEY) {
    const meta = http.get(`${BASE_URL}/v1/meta`, {
      headers: { 'X-API-Key': API_KEY },
    });
    check(meta, { 'meta 200': (r) => r.status === 200 });
  }

  sleep(1);
}
