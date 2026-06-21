const { Kafka } = require("kafkajs");
const fs = require("fs");
const path = require("path");

const kafka = new Kafka({
  clientId: "test-producer",
  brokers: ["kafka-26f06e40-notesxmait-c472.j.aivencloud.com:20310"],
  ssl: {
    rejectUnauthorized: true,
    ca: [fs.readFileSync(path.join(__dirname, "kafka-certs/ca.pem"))],
    cert: fs.readFileSync(path.join(__dirname, "kafka-certs/service.cert")),
    key: fs.readFileSync(path.join(__dirname, "kafka-certs/service.key")),
    servername: "kafka-26f06e40-notesxmait-c472.j.aivencloud.com",
  },
});

const producer = kafka.producer();

async function run() {
  await producer.connect();
  const deploymentId = process.argv[2] || "test-deployment";
  
  await producer.send({
    topic: "container-logs",
    messages: [
      { key: "log", value: JSON.stringify({ PROJECT_ID: "proj_123", DEPLOYEMENT_ID: deploymentId, log: "Test manual log message from debugger!" }) },
    ],
  });
  console.log("Sent log to deployment:", deploymentId);
  await producer.disconnect();
}

run().catch(console.error);
