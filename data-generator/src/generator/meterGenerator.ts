import { HourlyRecord } from "../data/csvLoader";
import { MeterReading, meterReadingSchema } from "../models/MeterReading";

// Generate a random factor within the specified range
function randomFactor(range: number): number {
  const offset = (Math.random() * 2 - 1) * range; // range in [-range, range]
  return 1 + offset;
}

// Generate meter readings for a single hourly record across multiple meters
export function generateMeterReadingsForInterval(
  baseRecord: HourlyRecord,
  meterCount: number
): MeterReading[] {
  const readings: MeterReading[] = [];
  // Generate readings for each meter
  const areaSuffix = baseRecord.area.trim().replace(/\s+/g, "-");
  for (let i = 1; i <= meterCount; i += 1) {
    const meterId = `meter-${String(i).padStart(3, "0")}@${areaSuffix}`;

    const consumption = Math.max(
      0,
      baseRecord.consumption_kwh * randomFactor(0.1)
    );
    const production = Math.max(
      0,
      baseRecord.production_kwh * randomFactor(0.15)
    );
    const spotPrice = Math.max(0, baseRecord.spot_price * randomFactor(0.05));

    const reading = meterReadingSchema.parse({
      meter_id: meterId,
      timestamp: baseRecord.timestamp,
      area: baseRecord.area,
      consumption_kwh: consumption,
      production_kwh: production,
      spot_price: spotPrice,
    });

    readings.push(reading);
  }

  return readings;
}

// Generate meter readings for all hourly records across multiple meters
export function generateAllMeterReadings(
  baseSeries: HourlyRecord[],
  meterCount: number
): MeterReading[] {
  return baseSeries.flatMap((record) =>
    generateMeterReadingsForInterval(record, meterCount)
  );
}
