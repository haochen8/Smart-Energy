# Digital Twin REST API

Secure, scalable REST API for external clients to query Digital Twin state and history data.

## Endpoints

- `GET /health` – readiness check + TimescaleDB connectivity (unauthenticated)
- `GET /docs` – Swagger UI
- `GET /openapi.json` – OpenAPI spec
- `POST /v1/predict`
- `POST /v1/predict/spot-price`
- `GET /ui` – custom UI dashboard
- `GET /v1/state/latest?series_id=...`
- `GET /v1/state/history?series_id=...&start=...&end=...&limit=...`
- `GET /v1/decisions/history?series_id=...&start=...&end=...&limit=...`
- `GET /v1/meta`

## Code map

- Routes + middleware: `src/app.ts`
- DB client + queries: `src/db.ts`
- Env config parsing: `src/config.ts`
- Process startup + shutdown: `src/index.ts`

## Environment configuration

Required:

- `API_KEY` – value expected in `X-API-Key` header
- `ALGORITHM_PROCESSOR_BASE_URL` – base URL for prediction service (e.g. `http://localhost:5001`)
- `TIMESCALE_HOST`, `TIMESCALE_PORT`, `TIMESCALE_DB`, `TIMESCALE_USER`, `TIMESCALE_PASSWORD`

Optional:

- `PORT` (default: `8080`)
- `CORS_ORIGINS` (comma-separated allowlist, use `*` to allow all)
- `MAX_HISTORY_LIMIT` (default: `1000`)
- `ALGORITHM_PROCESSOR_TIMEOUT_MS` (default: `5000`)
- `TIMESCALE_ENABLED` (default: `true`)
- `TIMESCALE_SSL` (default: `false`)

Note: prediction endpoints can fetch missing historical data from TimescaleDB when `records` are not provided.

See `.env.example` for a full template.

Swagger UI requires the API key for requests (use the "Authorize" button with `X-API-Key`).

## Local run

```bash
npm install
cp .env.example .env
npm run dev
```

Ensure the algorithm-processor service is running and reachable at `ALGORITHM_PROCESSOR_BASE_URL`.

## Test (curl)

```bash
curl http://localhost:8080/health

curl -H "X-API-Key: $API_KEY" \
  "http://localhost:8080/v1/state/latest?series_id=series-123"

curl -H "X-API-Key: $API_KEY" \
  "http://localhost:8080/v1/state/history?series_id=series-123&start=2024-01-01T00:00:00Z&end=2024-01-02T00:00:00Z&limit=100"

curl -H "X-API-Key: $API_KEY" \
  "http://localhost:8080/v1/decisions/history?series_id=series-123&start=2024-01-01T00:00:00Z&end=2024-01-02T00:00:00Z&limit=100"

curl -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"AREA":"Berga","records":[{"DateTime":"2025-01-01T00:00:00Z","price":48.0,"AREA":"Berga"}]}' \
  "http://localhost:8080/v1/predict"

curl -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"series_id":"series-123","start":"2025-01-01T00:00:00Z","end":"2025-01-02T00:00:00Z","limit":48}' \
  "http://localhost:8080/v1/predict"

curl -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"records":[{"DateTime":"2025-01-01T00:00:00Z","price":48.0,"AREA":"Berga"}]}' \
  "http://localhost:8080/v1/predict/spot-price"

curl -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"series_id":"series-123","start":"2025-01-01T00:00:00Z","end":"2025-01-02T00:00:00Z","limit":24}' \
  "http://localhost:8080/v1/predict/spot-price"
```

## Kubernetes deployment

Manifests live in the infrastructure repo under:

- `k8s/apps/rest-api/rest-api-deployment.yaml`
- `k8s/apps/rest-api/rest-api-service.yaml`
- `k8s/apps/rest-api/rest-api-hpa.yaml`
- `k8s/ingress/rest-api-ingress.yaml`
- `k8s/config/configmap-apps.yaml`
- `k8s/config/secrets-example.yaml`

Steps:

1. Build/push the Docker image from this repo and set it in the deployment manifest.
2. Set the `API_KEY` in `rest-api-secret` and TimescaleDB credentials in `timescaledb-secret`.
3. Update the Ingress host + ensure the `digital-twin-tls` secret exists.
4. Apply the manifests to the `kalmar-digital-twin` namespace.
