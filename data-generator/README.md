# data-generator

TypeScript microservice that replays hourly energy data to Kafka as smart meter readings. ❗ The CSV already contains hourly data and **no interpolation or 15-minute expansion is performed**.

## Features
- Reads an hourly CSV dataset (`timestamp, consumption_kwh, production_kwh, spot_price`)
- Simulates N smart meters per hourly row and publishes to Kafka topic `meter-readings`
- Batch mode: send the whole CSV once
- Streaming mode: emit one hourly row every X seconds
- Built with KafkaJS, fast-csv, dotenv, Zod, and Pino for logging

## Prerequisites
- Node.js 20+
- pnpm (enable via `corepack enable` if needed)
- Access to a Kafka cluster reachable from the service

## Setup
```bash
pnpm install
cp .env.example .env
# edit .env to match your Kafka and dataset settings
```

## Configuration
Environment variables:
- `KAFKA_BROKERS`: comma-separated broker list (e.g., `localhost:9092`)
- `KAFKA_CLIENT_ID`: client id for Kafka producer
- `KAFKA_SSL`: `true`/`false`
- `KAFKA_SASL_MECHANISM`: `plain`, `scram-sha-256`, `scram-sha-512`, etc.
- `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD`: SASL credentials if required
- `METER_COUNT`: number of simulated meters per hourly row
- `DATASET_PATH`: path to the hourly CSV (no interpolation expected)
- `DATASET_START`: optional lower bound timestamp (inclusive) for filtering the CSV (e.g., `2020-01-01 00:00:00`)
- `DATASET_END`: optional upper bound timestamp (inclusive) for filtering the CSV (e.g., `2020-12-31 23:00:00`)
- `STREAM_INTERVAL_SECONDS`: delay between hourly rows in streaming mode

## Running locally
```bash
# Batch: send entire CSV once
pnpm start:batch

# Streaming: one hourly row every STREAM_INTERVAL_SECONDS (default 5s)
pnpm start:stream
```
Both commands load the dataset as-is (hourly) and do not expand or interpolate data.

## Docker
```bash
# Build
docker build -t data-generator .

# Run (pass env file)
docker run --rm --env-file .env data-generator
```

## Testing with Kafka
- Ensure `meter-readings` topic exists.
- Consume messages to verify output, for example:
  ```bash
  kafka-console-consumer --bootstrap-server localhost:9092 --topic meter-readings --from-beginning
  ```

## Scripts
- `pnpm build` – compile TypeScript
- `pnpm start` – default start (matches `pnpm start:batch` unless adjusted)
- `pnpm start:batch` – batch send
- `pnpm start:stream` – streaming mode
- `pnpm lint` / `pnpm lint:fix` – ESLint
- `pnpm format` – Prettier

## License
MIT (see `LICENSE`).
