import { createClient } from 'redis';
import { AlgorithmProcessor, DecisionEngine, ShortTermForecaster, StoragePublisher } from './algorithmProcessor.js';
import { BusConsumer } from './busConsumer.js';
import { AppConfig, config, parseOffpeakRanges } from './config.js';
import { Kafka, Producer } from 'kafkajs';
import { TimescaleWriter } from './timescaleWriter.js';

export type RedisClient = ReturnType<typeof createClient> | null;

export async function buildRedisClient(host: string, port: number, db: number): Promise<RedisClient> {
  try {
    const client = createClient({ url: `redis://${host}:${port}`, database: db });
    await client.connect();
    await client.ping();
    return client;
  } catch (err) {
    console.warn('Redis unavailable for AlgorithmProcessor', err);
    return null;
  }
}

export async function buildAlgorithmProcessor(appConfig: AppConfig, redisClient: RedisClient) {
  const offpeakRanges = parseOffpeakRanges(appConfig.offpeakHours);
  const forecaster = new ShortTermForecaster(appConfig.spikeDeltaPct, appConfig.minPoints);
  const decisionEngine = new DecisionEngine(appConfig.priceThreshold, appConfig.lowPriceThreshold, offpeakRanges);

  let timescaleWriter: TimescaleWriter | undefined;
  if (appConfig.timescaleEnabled && appConfig.timescalePassword) {
    try {
      timescaleWriter = new TimescaleWriter({
        host: appConfig.timescaleHost,
        port: appConfig.timescalePort,
        database: appConfig.timescaleDb,
        user: appConfig.timescaleUser,
        password: appConfig.timescalePassword,
        ssl: appConfig.timescaleSsl,
        enableRetention: appConfig.timescaleEnableRetention,
        retentionDays: appConfig.timescaleRetentionDays,
      });
      await timescaleWriter.init();
    } catch (err) {
      console.warn('TimescaleDB unavailable for AlgorithmProcessor', err);
      timescaleWriter = undefined;
    }
  }

  let producer: Producer | null = null;
  if (process.env.NODE_ENV === 'test') {
    producer = null;
  } else if (appConfig.kafkaBrokers) {
    try {
      const kafka = new Kafka({ brokers: appConfig.kafkaBrokers.split(',') });
      producer = kafka.producer();
      await producer.connect();
    } catch (err) {
      console.warn('Kafka producer unavailable', err);
    }
  }

  const storagePublisher = new StoragePublisher(redisClient ?? undefined, producer ?? undefined, appConfig.processedTopic);
  return new AlgorithmProcessor(
    forecaster,
    decisionEngine,
    storagePublisher,
    redisClient ?? undefined,
    appConfig.historyLookbackPoints,
    timescaleWriter,
    Math.max(10, appConfig.minPoints),
  );
}

export async function startConsumerIfEnabled(appConfig: AppConfig, algorithmProcessor: AlgorithmProcessor) {
  if (!appConfig.enableStreamConsumer) return null;
  const consumer = new BusConsumer(
    algorithmProcessor,
    appConfig.kafkaBrokers,
    appConfig.energyTopic,
    appConfig.consumerGroup,
    appConfig.processEveryN,
    appConfig.maxMessagesPerSecond,
  );
  consumer.start().catch((err) => console.error('Bus consumer failed to start', err));
  return consumer;
}
