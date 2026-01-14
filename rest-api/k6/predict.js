import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://194.47.171.153';
const API_KEY = __ENV.API_KEY || '';
const AREA = __ENV.AREA || 'Kvarnholmen';
const INSECURE = (__ENV.INSECURE || 'true').toLowerCase() === 'true';

if (!API_KEY) {
  throw new Error('API_KEY is required');
}

const records = [
  { DateTime: '2020-01-01T00:00:00Z', price: 25.1 },
  { DateTime: '2020-01-01T01:00:00Z', price: 26.3 },
  { DateTime: '2020-01-01T02:00:00Z', price: 27.8 },
  { DateTime: '2020-01-01T03:00:00Z', price: 28.4 },
  { DateTime: '2020-01-01T04:00:00Z', price: 27.9 },
  { DateTime: '2020-01-01T05:00:00Z', price: 26.7 },
  { DateTime: '2020-01-01T06:00:00Z', price: 25.9 },
  { DateTime: '2020-01-01T07:00:00Z', price: 26.2 },
  { DateTime: '2020-01-01T08:00:00Z', price: 27.1 },
  { DateTime: '2020-01-01T09:00:00Z', price: 28.0 },
  { DateTime: '2020-01-01T10:00:00Z', price: 27.4 },
  { DateTime: '2020-01-01T11:00:00Z', price: 26.8 },
];

export const options = {
  vus: 2,
  duration: '20s',
  insecureSkipTLSVerify: INSECURE,
};

export default function () {
  const payload = JSON.stringify({ AREA, records });
  const res = http.post(`${BASE_URL}/v1/predict`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  });
  check(res, { 'predict 200': (r) => r.status === 200 });
  sleep(1);
}
