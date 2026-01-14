# k6 load tests

These scripts exercise the REST API endpoints used in the demo.

## Prereqs

- k6 installed locally (brew install k6)
- REST API reachable
- API key available

## Common env vars

- BASE_URL (default: https://194.47.171.153)
- API_KEY (required for all /v1 endpoints)
- AREA (default: Kvarnholmen)
- SERIES_ID (default: meter-040)
- INSECURE (default: true for self-signed TLS)

## Run examples

```bash
API_KEY=... k6 run k6/smoke.js
API_KEY=... k6 run k6/predict.js
API_KEY=... k6 run k6/spot-price.js
API_KEY=... k6 run k6/state-latest.js
API_KEY=... k6 run k6/area-latest.js
```
