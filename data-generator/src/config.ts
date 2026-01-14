import path from "path";
import dotenv from "dotenv";

dotenv.config();

const defaultDatasetPath = path.join("dataset", "data.csv");

// Application configuration constants
export const ROOT_DIR = process.cwd();
export const DATASET_PATH = process.env.DATASET_PATH || defaultDatasetPath;
export const DATASET_START = process.env.DATASET_START?.trim();
export const DATASET_END = process.env.DATASET_END?.trim();
export const METER_COUNT = Number(process.env.METER_COUNT ?? "10");
export const STREAM_INTERVAL_SECONDS = Number(
  process.env.STREAM_INTERVAL_SECONDS ?? "5"
);

// Kafka configuration constants
export const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "")
  .split(",")
  .map((b) => b.trim())
  .filter(Boolean);
export const KAFKA_CLIENT_ID =
  process.env.KAFKA_CLIENT_ID || "data-generator-service";
export const KAFKA_SSL = process.env.KAFKA_SSL === "true";
export const KAFKA_SASL_MECHANISM = process.env.KAFKA_SASL_MECHANISM;
export const KAFKA_SASL_USERNAME = process.env.KAFKA_SASL_USERNAME;
export const KAFKA_SASL_PASSWORD = process.env.KAFKA_SASL_PASSWORD;
export const KAFKA_MAX_MESSAGES_PER_BATCH = Number(
  process.env.KAFKA_MAX_MESSAGES_PER_BATCH ?? "500"
);

// Redis configuration (optional, for history warm-up)
export const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false";
export const REDIS_HOST = process.env.REDIS_HOST?.trim();
export const REDIS_PORT = Number(process.env.REDIS_PORT ?? "6379");
export const REDIS_DB = Number(process.env.REDIS_DB ?? "0");
