const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { LambdaClient, CreateFunctionCommand, AddPermissionCommand, CreateFunctionUrlConfigCommand } = require("@aws-sdk/client-lambda");
const mime = require("mime-types");
const { Kafka } = require("kafkajs");
const archiver = require("archiver");
require("dotenv").config();

// -------------------- AWS --------------------
const s3Client = new S3Client({ region: "us-east-1" });
const lambdaClient = new LambdaClient({ region: "us-east-1" });

// -------------------- ENV --------------------
const PROJECT_ID = process.env.PROJECT_ID || "unknown-project";
const DEPLOYEMENT_ID = process.env.DEPLOYEMENT_ID || "local";
const GIT_REPOSITORY_URL = process.env.GIT_REPOSITORY_URL;
const BRANCH = process.env.BRANCH || "main";
const LAMBDA_ROLE = process.env.AWS_LAMBDA_ROLE_ARN;

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

async function publishLog(log) {
  try {
    await producer.send({
      topic: "container-logs",
      messages: [{ key: "log", value: JSON.stringify({ PROJECT_ID, DEPLOYEMENT_ID, log }) }],
    });
  } catch (err) {}
}

process.on("uncaughtException", async (err) => {
  await publishLog(`FATAL: ${err.message}`);
  process.exit(1);
});

// -------------------- HELPERS --------------------
function zipDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 }});
    const stream = fs.createWriteStream(outPath);
    archive.directory(sourceDir, false);
    archive.on('error', err => reject(err));
    archive.pipe(stream);
    stream.on('close', () => resolve());
    archive.finalize();
  });
}

async function uploadToS3(distFolderPath, baseS3Path) {
  const distFiles = fs.readdirSync(distFolderPath, { recursive: true });
  for (const file of distFiles) {
    const filePath = path.join(distFolderPath, file);
    if (fs.lstatSync(filePath).isDirectory()) continue;

    // Fix backslashes on windows
    const s3Key = file.replace(/\\/g, "/");

    const command = new PutObjectCommand({
      Bucket: "vercel-clone-ws",
      Key: `${baseS3Path}/${s3Key}`,
      Body: fs.createReadStream(filePath),
      ContentType: mime.lookup(filePath) || "application/octet-stream",
    });
    try {
      await s3Client.send(command);
    } catch (err) {
      await publishLog(`UPLOAD FAILED: ${err.message}`);
    }
  }
}

// -------------------- MAIN --------------------
async function init() {
  try {
    await producer.connect();
    await publishLog("Build Started...");

    const outDirPath = path.join(__dirname, "output");
    if (fs.existsSync(outDirPath)) {
      fs.rmSync(outDirPath, { recursive: true, force: true });
    }

    await new Promise((res, rej) => {
      exec(`git clone --branch ${BRANCH} ${GIT_REPOSITORY_URL} ${outDirPath}`, (err) => {
        if (err) rej(err);
        else res();
      });
    });

    const USER_ENV_VARS = process.env.USER_ENV_VARS ? JSON.parse(process.env.USER_ENV_VARS) : {};
    let envContent = "";
    for (const [k, v] of Object.entries(USER_ENV_VARS)) {
      envContent += `${k}=${v}\n`;
    }
    fs.writeFileSync(path.join(outDirPath, ".env"), envContent);

    const command = `cd ${outDirPath} && npm install && npm run build`;
    const buildStartTime = Date.now();
    const p = exec(command, { timeout: 15 * 60 * 1000 });

    p.stdout.on("data", async (data) => await publishLog(data.toString()));
    p.stderr.on("data", async (data) => await publishLog(`error: ${data.toString()}`));

    p.on("close", async (code) => {
      if (code !== 0) {
        await publishLog(`Build Failed (exit code ${code})`);
        process.exit(1);
      }
      await publishLog("Build Complete");

      const pkgJsonPath = path.join(outDirPath, "package.json");
      let isNextJs = false;
      let dependencies = {};
      let devDependencies = {};

      if (fs.existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
        if (pkg.dependencies && pkg.dependencies.next) isNextJs = true;
        
        dependencies = pkg.dependencies || {};
        devDependencies = pkg.devDependencies || {};
      }

      // 🧠 AI Telemetry Extraction
      const buildEndTime = Date.now();
      const totalBuildTimeMs = buildEndTime - buildStartTime;

      const aiTelemetry = {
        type: "AI_TELEMETRY",
        dependencies,
        devDependencies,
        totalBuildTimeMs,
        isNextJs
      };

      await publishLog(`[AI_TELEMETRY] ${JSON.stringify(aiTelemetry)}`);

      const s3BasePath = `__outputs/${PROJECT_ID}/${DEPLOYEMENT_ID}`;

      if (isNextJs) {
        await publishLog("Next.js framework detected. Preparing SSR deployment...");
        const standaloneDir = path.join(outDirPath, ".next", "standalone");
        
        if (fs.existsSync(standaloneDir)) {
          // Copy static files into standalone so Lambda can serve them
          const staticDir = path.join(outDirPath, ".next", "static");
          if (fs.existsSync(staticDir)) {
            fs.cpSync(staticDir, path.join(standaloneDir, ".next", "static"), { recursive: true });
          }
          const publicDir = path.join(outDirPath, "public");
          if (fs.existsSync(publicDir)) {
            fs.cpSync(publicDir, path.join(standaloneDir, "public"), { recursive: true });
          }

          if (LAMBDA_ROLE) {
            await publishLog("Zipping SSR payload...");
            const zipPath = path.join(__dirname, "lambda.zip");
            await zipDirectory(standaloneDir, zipPath);

            await publishLog("Creating AWS Lambda Function...");
            const functionName = `deployr-${DEPLOYEMENT_ID.substring(0, 32)}`;
            
            try {
              await lambdaClient.send(new CreateFunctionCommand({
                FunctionName: functionName,
                Runtime: "nodejs20.x",
                Role: LAMBDA_ROLE,
                Handler: "server.js",
                Code: { ZipFile: fs.readFileSync(zipPath) },
                Timeout: 15,
                MemorySize: 512,
                Environment: Object.keys(USER_ENV_VARS).length ? { Variables: USER_ENV_VARS } : undefined,
              }));

              const urlRes = await lambdaClient.send(new CreateFunctionUrlConfigCommand({
                FunctionName: functionName,
                AuthType: "NONE"
              }));

              await lambdaClient.send(new AddPermissionCommand({
                FunctionName: functionName,
                StatementId: "AllowPublicAccess",
                Action: "lambda:InvokeFunctionUrl",
                Principal: "*",
                FunctionUrlAuthType: "NONE"
              }));

              await publishLog(`LAMBDA_URL: ${urlRes.FunctionUrl}`);
              await publishLog("SSR Deployment successful.");
            } catch (err) {
              await publishLog(`Lambda Creation Failed: ${err.message}`);
            }
          } else {
            await publishLog("WARNING: AWS_LAMBDA_ROLE_ARN missing. Skipping SSR Lambda. Falling back to static.");
          }
        } else {
          await publishLog("WARNING: .next/standalone missing. Did you add output: 'standalone' to next.config.js?");
        }
      }

      // Upload static files to S3 (fallback or assets)
      await publishLog("Starting static S3 upload...");
      const candidates = ["dist", "build", "out", ".next/static", "public"];
      for (const folder of candidates) {
        const fullPath = path.join(outDirPath, folder);
        if (fs.existsSync(fullPath)) {
          await publishLog(`uploading folder: ${folder}`);
          let targetPath = s3BasePath;
          if (folder === ".next/static") targetPath = `${s3BasePath}/_next/static`;
          await uploadToS3(fullPath, targetPath);
        }
      }

      await publishLog("Done");
      console.log("Done");
      process.exit(0);
    });
  } catch (err) {
    await publishLog(`FATAL: ${err.message}`);
    process.exit(1);
  }
}

init();
