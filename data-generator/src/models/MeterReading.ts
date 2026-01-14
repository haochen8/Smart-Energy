import { z } from "zod";

export const meterReadingSchema = z.object({
  meter_id: z.string().min(1),
  timestamp: z.string().min(1),
  area: z.string().min(1),
  consumption_kwh: z.number().min(0),
  production_kwh: z.number().min(0),
  spot_price: z.number().min(0),
});

export type MeterReading = z.infer<typeof meterReadingSchema>;
