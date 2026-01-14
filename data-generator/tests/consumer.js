// // // consumer.js
const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "external-consumer",
  brokers: ["194.47.171.153:30092"], // Extern Kafka-endpoint
});

async function run() {
  const consumer = kafka.consumer({ groupId: "external-team-group" });
  await consumer.connect();

  // Listen to the 'meter-readings' topic
  await consumer.subscribe({ topic: "meter-readings", fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const raw = message.value.toString();
      try {
        const parsed = JSON.parse(raw);
        console.log(parsed);
      } catch {
        console.log(raw);
      }
    },
  });
}

run().catch(console.error);
