import { Kafka } from 'kafkajs';
import { AlgorithmProcessor } from './algorithmProcessor.js';

export class BusConsumer {
  private consumerStarted = false;
  private processingCounter = 0;
  private windowStart = Date.now();
  private windowCount = 0;

  constructor(
    private processor: AlgorithmProcessor,
    private brokers: string,
    private topic: string,
    private groupId: string,
    private processEveryN: number = 1,
    private maxMessagesPerSecond: number = 200,
  ) {}

  async start(): Promise<void> {
    if (this.consumerStarted) return;
    if (!this.brokers) {
      console.warn('No brokers configured; BusConsumer not started.');
      return;
    }

    const kafka = new Kafka({ brokers: this.brokers.split(',') });
    const consumer = kafka.consumer({ groupId: this.groupId });
    await consumer.connect();
    await consumer.subscribe({ topic: this.topic, fromBeginning: false });

    this.consumerStarted = true;

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const payload = message.value.toString();
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(payload);
        } catch (_) {
          return;
        }
        if (!parsed) return;

        if (!this.allowNow()) return;

        if ((this.processingCounter % this.processEveryN) !== 0) {
          this.processingCounter += 1;
          return;
        }

        this.processingCounter += 1;
        try {
          await this.processor.process(parsed);
        } catch (err) {
          console.warn('Processing failed', err);
        }
      },
    });
  }

  private allowNow(): boolean {
    const now = Date.now();
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.windowCount = 0;
    }
    this.windowCount += 1;
    return this.windowCount <= this.maxMessagesPerSecond;
  }
}
