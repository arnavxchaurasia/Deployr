const express = require("express");
const { generateSlug } = require("random-word-slugs");
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");
const { Server } = require("socket.io");
const cors = require("cors");
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();


const { createClient } = require("@clickhouse/client");
const { Kafka } = require("kafkajs");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 9000;

app.use(express.json());
app.use(cors());

// ---------------- Prisma ----------------
const prisma = new PrismaClient();

// ---------------- Socket.io ----------------
const io = new Server({ cors: "*" });

io.on("connection", socket => {
  socket.on("subscribe", channel => {
    socket.join(channel);
    socket.emit("message", JSON.stringify({ log: `Subscribed to ${channel}` }));
  });
});

io.listen(9002, () => console.log("Socket server on 9002"));

// ---------------- Kafka (Aiven mTLS) ----------------
const kafka = new Kafka({
  clientId: "api-server",
  brokers: ["kafka-26f06e40-notesxmait-c472.j.aivencloud.com:20310"],

  ssl: {
    rejectUnauthorized: true,

    // IMPORTANT: remove "utf-8"
    ca: [fs.readFileSync(path.join(__dirname, "kafka-certs/ca.pem"))],
    cert: fs.readFileSync(path.join(__dirname, "kafka-certs/service.cert")),
    key: fs.readFileSync(path.join(__dirname, "kafka-certs/service.key")),

    // VERY IMPORTANT for Aiven TLS
    servername: "kafka-26f06e40-notesxmait-c472.j.aivencloud.com",
  },

  connectionTimeout: 15000,
  requestTimeout: 30000,
});

const consumer = kafka.consumer({ groupId: "api-server-logs-consumer" });

// ---------------- ClickHouse ----------------
const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL,
  database: process.env.CLICKHOUSE_DB,
});



// ---------------- Kafka Consumer ----------------
async function initKafkaConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topics: ["container-logs"], fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      const data = JSON.parse(message.value.toString());
      const { DEPLOYEMENT_ID, log } = data;

      console.log("LOG:", DEPLOYEMENT_ID, log);

      // Save to ClickHouse
      await clickhouse.insert({
        table: "log_events",
        values: [
          {
            event_id: uuidv4(),
            deployment_id: DEPLOYEMENT_ID,
            log,
          },
        ],
        format: "JSONEachRow",
      });

      // Send realtime to websocket
      io.to(DEPLOYEMENT_ID).emit(
        "message",
        JSON.stringify({ log })
      );
    },
  });
}

initKafkaConsumer();

// ---------------- AWS ECS ----------------
const ecsClient = new ECSClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});


const CLUSTER =
  "arn:aws:ecs:us-east-1:097457367826:cluster/builder-cluster-ws";
const TASK =
  "arn:aws:ecs:us-east-1:097457367826:task-definition/builder-task";

// ---------------- Routes ----------------

// Create project
app.post("/project", async (req, res) => {
  const schema = z.object({
    name: z.string(),
    gitURL: z.string(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      gitURL: parsed.data.gitURL,
      subDomain: generateSlug(),
    },
  });

  res.json({ status: "success", data: project });
});

// Deploy project
app.post("/deploy", async (req, res) => {
  const { projectId } = req.body;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) return res.status(404).json({ error: "Project not found" });

  const deployment = await prisma.deployment.create({
    data: {
      project: { connect: { id: projectId } },
      status: "QUEUED",
    },
  });

  const command = new RunTaskCommand({
    cluster: CLUSTER,
    taskDefinition: TASK,
    launchType: "FARGATE",
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: "ENABLED",
        subnets: [
          "subnet-0c880cd48957e3b04",
          "subnet-0a8f5863458162f15",
          "subnet-0df491ac14b434dc5",
        ],
        securityGroups: ["sg-07baa83f9ed7f4ba4"],
      },
    },
    overrides: {
      containerOverrides: [
        {
      
    name: "builder-image",

          environment: [
            { name: "GIT_REPOSITORY_URL", value: project.gitURL },
            { name: "PROJECT_ID", value: projectId },
            { name: "DEPLOYEMENT_ID", value: deployment.id },
          ],
        },
      ],
    },
  });

  await ecsClient.send(command);

  res.json({
    status: "queued",
    data: { deploymentId: deployment.id },
  });
});

// Fetch old logs
app.get("/logs/:id", async (req, res) => {
  const deploymentId = req.params.id;

  const result = await clickhouse.query({
    query:
      "SELECT deployment_id, log, timestamp FROM log_events WHERE deployment_id = {id:String}",
    query_params: { id: deploymentId },
    format: "JSONEachRow",
  });

  const logs = await result.json();
  res.json({ logs });
});


app.get('/resolve/:subdomain', async (req, res) => {
  const project = await prisma.project.findFirst({
    where: { subDomain: req.params.subdomain }
  });

  if (!project) return res.status(404).json({ error: 'Not found' });

  res.json({ projectId: project.id });
});





// ---------------- Start ----------------
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
