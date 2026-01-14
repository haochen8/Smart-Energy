// test-kafka.js
// Quick metadata probe to verify connectivity.
// Env:
//   BROKERS: comma-separated broker list (default 194.47.171.153:30092)
const { Kafka } = require("kafkajs");

async function main() {
  const brokers =
    process.env.BROKERS?.split(",").map((b) => b.trim()).filter(Boolean) ||
    ["194.47.171.153:30092"];

  const kafka = new Kafka({
    clientId: "external-tester",
    brokers,
  });

  const admin = kafka.admin();
  await admin.connect();

  console.log("Connected to Kafka, listing topics...");
  const topics = await admin.listTopics();
  console.log("Topics:", topics);

  await admin.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed to talk to Kafka:", err);
  process.exit(1);
});
