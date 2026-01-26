const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mime = require("mime-types");
const { Kafka } = require("kafkajs");
require("dotenv").config();

// -------------------- AWS S3 --------------------
const s3Client = new S3Client({
  region: "us-east-1", // IAM role credentials will be used automatically
});

// -------------------- ENV --------------------
const PROJECT_ID = process.env.PROJECT_ID || "unknown-project";
const DEPLOYEMENT_ID = process.env.DEPLOYEMENT_ID || "local";
const GIT_REPOSITORY_URL = process.env.GIT_REPOSITORY_URL;

if (!GIT_REPOSITORY_URL) {
  console.error("❌ GIT_REPOSITORY_URL env var missing");
  process.exit(1);
}

// -------------------- KAFKA --------------------
const kafka = new Kafka({
  clientId: `docker-build-server-${DEPLOYEMENT_ID}`,
  brokers: ["kafka-26f06e40-notesxmait-c472.j.aivencloud.com:20310"],
  ssl: {
    rejectUnauthorized: true,
    ca: [fs.readFileSync(path.join(__dirname, "kafka-certs/ca.pem"))],
    cert: fs.readFileSync(path.join(__dirname, "kafka-certs/service.cert")),
    key: fs.readFileSync(path.join(__dirname, "kafka-certs/service.key")),
    servername: "kafka-26f06e40-notesxmait-c472.j.aivencloud.com",
  },
  connectionTimeout: 15000,
  requestTimeout: 30000,
});

const producer = kafka.producer();

// -------------------- LOG --------------------
async function publishLog(log) {
  try {
    await producer.send({
      topic: "container-logs",
      messages: [
        {
          key: "log",
          value: JSON.stringify({
            PROJECT_ID,
            DEPLOYEMENT_ID,
            log,
          }),
        },
      ],
    });
  } catch (err) {
    console.error("Kafka log failed:", err.message);
  }
}

// -------------------- MAIN --------------------
async function init() {
  try {
    console.log("Connecting to Kafka...");
    await producer.connect();
    console.log("Kafka connected");

    await publishLog("Build Started...");

    const outDirPath = path.join(__dirname, "output");

    // Clean old build
    if (fs.existsSync(outDirPath)) {
      fs.rmSync(outDirPath, { recursive: true, force: true });
    }

    // Clone repo
    const command = `
      git clone ${GIT_REPOSITORY_URL} ${outDirPath} &&
      cd ${outDirPath} &&
      npm install &&
      npm run build
    `;

    const p = exec(command);

    p.stdout.on("data", async (data) => {
      console.log(data.toString());
      await publishLog(data.toString());
    });

    p.stderr.on("data", async (data) => {
      console.error(data.toString());
      await publishLog(`error: ${data.toString()}`);
    });

    p.on("close", async () => {
      await publishLog("Build Complete");

      const distFolderPath = path.join(outDirPath, "dist");

      if (!fs.existsSync(distFolderPath)) {
        await publishLog("❌ dist folder missing. Build failed.");
        process.exit(1);
      }

      const distFiles = fs.readdirSync(distFolderPath, { recursive: true });

      await publishLog("Starting upload...");

      for (const file of distFiles) {
        const filePath = path.join(distFolderPath, file);
        if (fs.lstatSync(filePath).isDirectory()) continue;

        await publishLog(`uploading ${file}`);

        const command = new PutObjectCommand({
          Bucket: "vercel-clone-ws",
          Key: `__outputs/${PROJECT_ID}/${file}`,
          Body: fs.createReadStream(filePath),
          ContentType: mime.lookup(filePath) || "application/octet-stream",
        });

        try {
          await s3Client.send(command);
          await publishLog(`uploaded ${file}`);
        } catch (err) {
          await publishLog(`UPLOAD FAILED: ${err.message}`);
          console.error(err);
        }
      }

      await publishLog("Done");
      console.log("Done");
      process.exit(0);
    });
  } catch (err) {
    console.error("Fatal error:", err);
    await publishLog(`FATAL: ${err.message}`);
    process.exit(1);
  }
}

init();
