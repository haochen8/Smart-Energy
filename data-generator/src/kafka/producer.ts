import {
  Kafka,
  KafkaConfig,
  logLevel,
  Producer,
  SASLOptions,
  CompressionTypes,
} from "kafkajs";
import {
  KAFKA_BROKERS,
  KAFKA_CLIENT_ID,
  KAFKA_SSL,
  KAFKA_SASL_MECHANISM,
  KAFKA_SASL_USERNAME,
  KAFKA_SASL_PASSWORD,
  KAFKA_MAX_MESSAGES_PER_BATCH,
} from "../config";
import logger from "../logger";
import { MeterReading } from "../models/MeterReading";

let producer: Producer | null = null;

// Build Kafka configuration object based on environment variables
function buildKafkaConfig(): KafkaConfig {
  let sasl: SASLOptions | undefined;
  if (KAFKA_SASL_MECHANISM && KAFKA_SASL_USERNAME && KAFKA_SASL_PASSWORD) {
    switch (KAFKA_SASL_MECHANISM) {
      case "plain":
        sasl = {
          mechanism: "plain",
          username: KAFKA_SASL_USERNAME,
          password: KAFKA_SASL_PASSWORD,
        };
        break;
      case "scram-sha-256":
        sasl = {
          mechanism: "scram-sha-256",
          username: KAFKA_SASL_USERNAME,
          password: KAFKA_SASL_PASSWORD,
        };
        break;
      case "scram-sha-512":
        sasl = {
          mechanism: "scram-sha-512",
          username: KAFKA_SASL_USERNAME,
          password: KAFKA_SASL_PASSWORD,
        };
        break;
      default:
        logger.warn(
          `Unsupported KAFKA_SASL_MECHANISM '${KAFKA_SASL_MECHANISM}', skipping SASL configuration.`
        );
        sasl = undefined;
    }
  }

  return {
    clientId: KAFKA_CLIENT_ID,
    brokers: KAFKA_BROKERS,
    ssl: KAFKA_SSL,
    sasl,
    logLevel: logLevel.NOTHING,
  };
}

async function getProducer(): Promise<Producer> {
  if (producer) return producer;

  if (!KAFKA_BROKERS.length) {
    throw new Error("KAFKA_BROKERS is not configured");
  }

  const kafka = new Kafka(buildKafkaConfig());
  producer = kafka.producer();
  await producer.connect();
  logger.info("Kafka producer connected");
  return producer;
}

export async function sendMeterReadings(
  topic: string,
  readings: MeterReading[]
): Promise<void> {
  const kafkaProducer = await getProducer();

  if (!readings.length) return;

  const messages = readings.map((reading) => {
    const parsedTs = Date.parse(reading.timestamp);
    const timestamp = Number.isFinite(parsedTs) ? String(parsedTs) : undefined;

    return {
      value: JSON.stringify(reading),
      key: reading.meter_id,
      timestamp,
    };
  });

  const chunks = chunkArray(messages, Math.max(1, KAFKA_MAX_MESSAGES_PER_BATCH));

  for (const chunk of chunks) {
    await kafkaProducer.send({
      topic,
      messages: chunk,
      compression: CompressionTypes.GZIP,
    });
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
