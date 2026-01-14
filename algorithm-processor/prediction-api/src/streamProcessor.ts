import { Kafka } from 'kafkajs';
import { SpotPricePredictor } from './spotPricePredictor.js';

export interface StreamProcessorOptions {
  predictor: SpotPricePredictor;
  brokers: string;
  sourceTopic: string;
  targetTopic: string;
  groupId: string;
  horizonMinutes?: number;
  bufferSize?: number;
}

interface RecordMessage {
  timestamp: string;
  price: number;
  series_id: string;
  area: string;
  customer: string;
  raw: Record<string, unknown>;
}

export class EnergyStreamProcessor {
  private buffers = new Map<string, RecordMessage[]>();

  constructor(private options: StreamProcessorOptions) {}

  private append(seriesId: string, record: RecordMessage) {
    const buffer = this.buffers.get(seriesId) || [];
    buffer.push(record);
    const limit = this.options.bufferSize ?? 48;
    if (buffer.length > limit) buffer.splice(0, buffer.length - limit);
    this.buffers.set(seriesId, buffer);
  }

  async start(): Promise<void> {
    if (!this.options.brokers) {
      console.warn('Stream consumer not started. Missing brokers.');
      return;
    }
    const kafka = new Kafka({ brokers: this.options.brokers.split(',') });
    const consumer = kafka.consumer({ groupId: this.options.groupId });
    const producer = kafka.producer();

    await consumer.connect();
    await producer.connect();
    await consumer.subscribe({ topic: this.options.sourceTopic, fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const parsed = this.parseMessage(message.value.toString());
        if (!parsed) return;
        this.append(parsed.series_id, parsed);
        try {
          const result = this.options.predictor.predict(
            ((this.buffers.get(parsed.series_id) || []) as unknown as Record<string, unknown>[]),
            this.options.horizonMinutes ?? 60,
          );
          const payload = this.formatPayload(parsed, result);
          await producer.send({ topic: this.options.targetTopic, messages: [{ value: JSON.stringify(payload) }] });
        } catch (err) {
          console.warn('Prediction failed for stream record', err);
        }
      },
    });
  }

  private parseMessage(raw: string): RecordMessage | null {
    try {
      const record = JSON.parse(raw) as Record<string, unknown>;
      const price = record['Price'] ?? record['price'] ?? record['spot_price'];
      const timestamp = (record['DateTime'] ?? record['timestamp'] ?? record['time'] ?? record['date']) as
        | string
        | undefined;
      const area = (record['AREA'] ?? record['area']) as string | undefined;
      const customer = (record['CUSTOMER'] ?? record['customer']) as string | undefined;
      if (price === undefined || timestamp === undefined) return null;
      const priceVal = Number(price);
      if (!Number.isFinite(priceVal)) return null;
      const meterId = record['meter_id'] ?? record['meterId'] ?? record['meter'];
      let series_id = `${(area ?? 'unknown').trim()}:${(customer ?? 'unknown').trim()}`;
      if (typeof meterId === 'string' && meterId.trim()) series_id = meterId.trim();
      if (typeof meterId === 'number' && Number.isFinite(meterId)) series_id = String(meterId);
      return {
        timestamp,
        price: priceVal,
        series_id,
        area: (area ?? 'unknown').trim(),
        customer: (customer ?? 'unknown').trim(),
        raw: record,
      };
    } catch (_) {
      return null;
    }
  }

  private formatPayload(record: RecordMessage, predictionResult: ReturnType<SpotPricePredictor['predict']>) {
    return {
      series_id: record.series_id,
      area: record.area,
      customer: record.customer,
      ingest_timestamp: record.timestamp,
      predicted_price_next_minutes: predictionResult.horizonMinutes,
      predicted_price: predictionResult.predictedPrice,
      confidence: predictionResult.confidence,
      trend: predictionResult.trend,
      change_pct: predictionResult.changePct,
      recommendation: predictionResult.recommendation,
      meta: {
        supporting_points: predictionResult.supportingPoints,
        lookback_used: predictionResult.lookbackUsed,
        interval_minutes: predictionResult.intervalMinutes,
      },
    };
  }
}
