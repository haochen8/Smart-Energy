import * as config from "./config";
import logger from "./logger";
import {
  loadHourlyDataset,
  streamHourlyGroups,
  type HourlyRecord,
} from "./data/csvLoader";
import {
  generateAllMeterReadings,
  generateMeterReadingsForInterval,
} from "./generator/meterGenerator";
import { sendMeterReadings } from "./kafka/producer";
import { storeReadingsInRedis } from "./redis/historyWriter";

const TOPIC = "meter-readings";

// Parse command-line arguments for mode and interval
function parseCliArgs() {
  const args = process.argv.slice(2);
  const isBatch = args.includes("--batch");
  const intervalArg = args.find((arg) => arg.startsWith("--interval="));
  const parsedInterval = intervalArg
    ? Number(intervalArg.split("=")[1])
    : config.STREAM_INTERVAL_SECONDS;
  const intervalSeconds = Number.isFinite(parsedInterval)
    ? parsedInterval
    : config.STREAM_INTERVAL_SECONDS;

  return { isBatch, intervalSeconds };
}

// Sleep for the specified number of milliseconds
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collapseByArea(records: HourlyRecord[]): HourlyRecord[] {
  const byArea = new Map<string, HourlyRecord>();
  for (const record of records) {
    const areaKey = record.area.trim();
    if (!areaKey) continue;
    if (!byArea.has(areaKey)) {
      byArea.set(areaKey, record);
    }
  }
  return Array.from(byArea.values());
}

function collapseByTimestampArea(records: HourlyRecord[]): HourlyRecord[] {
  const byKey = new Map<string, HourlyRecord>();
  for (const record of records) {
    const areaKey = record.area.trim();
    if (!areaKey || !record.timestamp) continue;
    const key = `${record.timestamp}::${areaKey}`;
    if (!byKey.has(key)) {
      byKey.set(key, record);
    }
  }
  return Array.from(byKey.values());
}

// Main execution function
async function run() {
  const { isBatch, intervalSeconds } = parseCliArgs();

  const meterCount = config.METER_COUNT > 0 ? config.METER_COUNT : 1;

  logger.info(
    {
      mode: isBatch ? "batch" : "stream",
      intervalSeconds: isBatch ? undefined : intervalSeconds,
      meterCount,
      datasetPath: config.DATASET_PATH,
      topic: TOPIC,
    },
    "Starting data generator"
  );

  if (isBatch) {
    const baseSeries = await loadHourlyDataset(config.DATASET_PATH);
    const collapsedSeries = collapseByTimestampArea(baseSeries);
    if (!baseSeries.length) {
      throw new Error("Loaded dataset is empty");
    }
    const readings = generateAllMeterReadings(collapsedSeries, meterCount);
    await sendMeterReadings(TOPIC, readings);
    await storeReadingsInRedis(readings);
    logger.info({ count: readings.length }, "Batch send completed");
    process.exit(0);
  }

  const intervalMs = intervalSeconds * 1000;

  // Streaming loop: stream the dataset hour-by-hour without loading the entire file
  // eslint-disable-next-line no-constant-condition
  while (true) {
    for await (const group of streamHourlyGroups(config.DATASET_PATH)) {
      const collapsedRecords = collapseByArea(group.records);
      const readings = collapsedRecords.flatMap((record: HourlyRecord) =>
        generateMeterReadingsForInterval(record, meterCount)
      );
      await sendMeterReadings(TOPIC, readings);
      await storeReadingsInRedis(readings);
      logger.info(
        {
          timestamp: group.timestamp,
          groupSize: group.records.length,
          areaCount: collapsedRecords.length,
          sent: readings.length,
        },
        "Sent streaming meter readings"
      );

      await sleep(intervalMs);
    }
  }
}

run().catch((err) => {
  logger.error({ err }, "Fatal error in data generator");
  process.exit(1);
});
