import fs from "fs/promises";
import path from "path";
import { parseFile } from "fast-csv";
import {
  DATASET_END,
  DATASET_PATH,
  DATASET_START,
  ROOT_DIR,
} from "../config";
import logger from "../logger";

// Define the structure of a single record in the dataset
export interface HourlyRecord {
  timestamp: string;
  area: string;
  consumption_kwh: number;
  production_kwh: number;
  spot_price: number;
}

// Load and parse the CSV dataset into an array of HourlyRecord objects
export async function loadHourlyDataset(
  datasetPath: string = DATASET_PATH
): Promise<HourlyRecord[]> {
  const resolvedPath = await resolveDatasetPath(datasetPath);

  return new Promise((resolve, reject) => {
    const records: HourlyRecord[] = [];
    let rowNumber = 1;

    parseFile(resolvedPath, { headers: true, trim: true })
      .on("error", (err) => {
        logger.error({ err, path: resolvedPath }, "Failed to parse dataset CSV");
        reject(err);
      })
      .on("data", (row: Record<string, string>) => {
        const parsed = normalizeRow(row);
        if (!parsed) {
          logger.warn({ rowNumber, row }, "Skipping invalid CSV row");
          rowNumber += 1;
          return;
        }

        if (!isTimestampInRange(parsed.timestamp)) {
          rowNumber += 1;
          return;
        }

        records.push(parsed);
        rowNumber += 1;
      })
      .on("end", () => resolve(records));
  });
}

// Async generator that yields all rows for a given timestamp together.
// This avoids loading the entire dataset into memory (important for large CSVs).
export async function* streamHourlyGroups(
  datasetPath: string = DATASET_PATH
): AsyncGenerator<{ timestamp: string; records: HourlyRecord[] }, void, void> {
  const resolvedPath = await resolveDatasetPath(datasetPath);

  let currentTimestamp: string | null = null;
  let currentRecords: HourlyRecord[] = [];
  let rowNumber = 1;

  const parser = parseFile(resolvedPath, { headers: true, trim: true });
  parser.on("error", (err) => {
    logger.error({ err, path: resolvedPath }, "Failed to parse dataset CSV");
    parser.destroy(err);
  });

  for await (const row of parser) {
    const parsed = normalizeRow(row as Record<string, string>);
    if (!parsed) {
      logger.warn({ rowNumber, row }, "Skipping invalid CSV row");
      rowNumber += 1;
      continue;
    }

    if (!isTimestampInRange(parsed.timestamp)) {
      rowNumber += 1;
      continue;
    }

    if (currentTimestamp === null) {
      currentTimestamp = parsed.timestamp;
      currentRecords.push(parsed);
    } else if (parsed.timestamp === currentTimestamp) {
      currentRecords.push(parsed);
    } else {
      yield { timestamp: currentTimestamp, records: currentRecords };
      currentTimestamp = parsed.timestamp;
      currentRecords = [parsed];
    }

    rowNumber += 1;
  }

  if (currentTimestamp && currentRecords.length) {
    yield { timestamp: currentTimestamp, records: currentRecords };
  }
}

// Normalize and validate a single CSV row into an HourlyRecord object
function normalizeRow(row: Record<string, string>): HourlyRecord | null {
  // Accept both the repo's expected headers and the dataset's actual headers (e.g., DateTime, Power_Consumption, Price)
  const timestamp = (row.timestamp ?? row.DateTime ?? "").trim();
  const area = (row.area ?? row.AREA ?? "").trim();
  const consumption = Number(row.consumption_kwh ?? row.Power_Consumption);
  const production = Number(row.production_kwh ?? row.Power_Production ?? 0);
  const spotPrice = Number(row.spot_price ?? row.Price ?? row.price);

  if (
    !timestamp ||
    !area ||
    !Number.isFinite(consumption) ||
    !Number.isFinite(production) ||
    !Number.isFinite(spotPrice)
  ) {
    return null;
  }

  return {
    timestamp,
    area,
    consumption_kwh: consumption,
    production_kwh: production,
    spot_price: spotPrice,
  };
}

function isTimestampInRange(timestamp: string): boolean {
  if (DATASET_START && timestamp < DATASET_START) {
    return false;
  }

  if (DATASET_END && timestamp > DATASET_END) {
    return false;
  }

  return true;
}

async function resolveDatasetPath(datasetPath: string): Promise<string> {
  const resolvedPath = path.isAbsolute(datasetPath)
    ? datasetPath
    : path.resolve(ROOT_DIR, datasetPath);

  try {
    await fs.access(resolvedPath);
  } catch (err) {
    logger.error({ err, path: resolvedPath }, "Dataset file not found");
    throw new Error(`Dataset file not found at ${resolvedPath}`);
  }

  return resolvedPath;
}
