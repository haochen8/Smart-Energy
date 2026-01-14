import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://194.47.171.153';
const API_KEY = __ENV.API_KEY || '';
const AREA = __ENV.AREA || 'Kvarnholmen';
const INSECURE = (__ENV.INSECURE || 'true').toLowerCase() === 'true';

if (!API_KEY) {
  throw new Error('API_KEY is required');
}

export const options = {
  vus: 2,
  duration: '20s',
  insecureSkipTLSVerify: INSECURE,
};

export default function () {
  const res = http.get(`${BASE_URL}/v1/area/latest?area=${encodeURIComponent(AREA)}&limit=5`, {
    headers: {
      'X-API-Key': API_KEY,
    },
  });
  check(res, { 'area latest 200/404': (r) => r.status === 200 || r.status === 404 });
  sleep(1);
}
