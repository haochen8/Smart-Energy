// // producer.js
const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "external-producer",
  brokers: ["194.47.171.153:30092"],
});

async function run() {
  const producer = kafka.producer();
  await producer.connect();

  await producer.send({
    topic: "meter-readings",
    messages: [
      {
        value: JSON.stringify({
          meter_id: "meter-001",
          timestamp: new Date().toISOString(),
          area: "Kvarnholmen",
          consumption_kwh: 0.0112,
          production_kwh: 0,
          spot_price: 28.45,
        }),
      },
    ],
  });

  await producer.disconnect();
}

run().catch(console.error);
