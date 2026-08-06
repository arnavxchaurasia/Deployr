const { exec, execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { LambdaClient, CreateFunctionCommand, AddPermissionCommand, CreateFunctionUrlConfigCommand } = require("@aws-sdk/client-lambda");
const mime = require("mime-types");
const { Kafka } = require("kafkajs");
const archiver = require("archiver");
const { scanForSecrets } = require("./secretScanner");
require("dotenv").config();

// -------------------- AWS --------------------
// S3 output bucket is single-region by design (one canonical asset store);
// Lambda functions follow the project's region (see AWS_REGION override) so
// SSR/functions run close to that project's chosen region.
const s3Client = new S3Client({ region: "us-east-1" });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || "us-east-1" });

// -------------------- ENV --------------------
const PROJECT_ID = process.env.PROJECT_ID || "unknown-project";
const DEPLOYEMENT_ID = process.env.DEPLOYEMENT_ID || "local";
const GIT_REPOSITORY_URL = process.env.GIT_REPOSITORY_URL;
// Deploy without git: when set, the archive is extracted directly and
// install/build/clone are skipped entirely — see init()'s branch below.
const PREBUILT_ARCHIVE_S3_KEY = process.env.PREBUILT_ARCHIVE_S3_KEY;
const BRANCH = process.env.BRANCH || "main";
const LAMBDA_ROLE = process.env.AWS_LAMBDA_ROLE_ARN;
const INSTALL_COMMAND = process.env.INSTALL_COMMAND || "npm ci";
const BUILD_COMMAND = process.env.BUILD_COMMAND || "npm run build";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "dist";
const ROOT_DIR = process.env.ROOT_DIR || ".";
const PROJECT_SLUG = process.env.PROJECT_SLUG || "";

if (!GIT_REPOSITORY_URL && !PREBUILT_ARCHIVE_S3_KEY) {
  console.error("❌ Neither GIT_REPOSITORY_URL nor PREBUILT_ARCHIVE_S3_KEY is set");
  process.exit(1);
}

// Validate inputs to prevent shell injection in git clone
if (GIT_REPOSITORY_URL) try {
  const parsed = new URL(GIT_REPOSITORY_URL);
  if (!["https:", "http:", "git:"].includes(parsed.protocol)) {
    throw new Error("Invalid protocol");
  }
} catch {
  console.error("❌ Invalid GIT_REPOSITORY_URL:", GIT_REPOSITORY_URL);
  process.exit(1);
}

if (!/^[a-zA-Z0-9._\-/]+$/.test(BRANCH)) {
  console.error("❌ Invalid BRANCH value:", BRANCH);
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

function zipFile(filePath, outPath) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(outPath);
    archive.append(fs.createReadStream(filePath), { name: path.basename(filePath) });
    archive.on('error', reject);
    archive.pipe(stream);
    stream.on('close', resolve);
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

// -------------------- CACHE HELPERS --------------------

/**
 * Compute a SHA-256 cache key from the lockfile content + install command.
 * Returns null if no lockfile is found.
 */
function computeCacheKey(workDir, installCommand) {
  const lockfiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
  for (const lf of lockfiles) {
    const p = path.join(workDir, lf);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf-8");
      return crypto.createHash("sha256").update(content + installCommand).digest("hex");
    }
  }
  return null;
}

/**
 * Try to restore node_modules from S3 cache.
 * Returns true if cache hit (tar extracted successfully), false otherwise.
 */
async function restoreCache(cacheKey, workDir) {
  const s3Key = `__cache/${PROJECT_ID}/${cacheKey}.tar.gz`;
  try {
    const res = await s3Client.send(new GetObjectCommand({
      Bucket: "vercel-clone-ws",
      Key: s3Key,
    }));

    // Pipe S3 stream into tar
    await new Promise((resolve, reject) => {
      const tarProc = require("child_process").spawn("tar", ["-xz", "-C", workDir], {
        stdio: ["pipe", "inherit", "inherit"],
      });
      res.Body.pipe(tarProc.stdin);
      res.Body.on("error", reject);
      tarProc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`tar exited with code ${code}`));
      });
      tarProc.on("error", reject);
    });

    return true;
  } catch (err) {
    // Cache miss or any error — treat as miss
    return false;
  }
}

/**
 * Deploy without git: download a prebuilt archive from S3 and extract it
 * directly into destDir. Throws on failure (unlike restoreCache, a missing
 * archive here is a hard error, not a fallback-to-normal-flow case).
 */
async function downloadAndExtractArchive(s3Key, destDir) {
  const res = await s3Client.send(new GetObjectCommand({ Bucket: "vercel-clone-ws", Key: s3Key }));

  await new Promise((resolve, reject) => {
    const tarProc = require("child_process").spawn("tar", ["-xz", "-C", destDir], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    res.Body.pipe(tarProc.stdin);
    res.Body.on("error", reject);
    tarProc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with code ${code}`));
    });
    tarProc.on("error", reject);
  });
}

/**
 * Upload node_modules to S3 cache (fire and forget — never throws).
 */
async function saveCache(cacheKey, workDir) {
  const s3Key = `__cache/${PROJECT_ID}/${cacheKey}.tar.gz`;
  const tmpTar = "/tmp/nm-cache.tar.gz";
  try {
    await new Promise((resolve, reject) => {
      execFile("tar", ["-czf", tmpTar, "-C", workDir, "node_modules"], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await s3Client.send(new PutObjectCommand({
      Bucket: "vercel-clone-ws",
      Key: s3Key,
      Body: fs.createReadStream(tmpTar),
      ContentType: "application/gzip",
    }));

    await publishLog("Cache saved (node_modules)");
  } catch (err) {
    // Non-fatal
    await publishLog(`Cache save failed (non-fatal): ${err.message}`);
  } finally {
    try { fs.rmSync(tmpTar, { force: true }); } catch {}
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
    fs.mkdirSync(outDirPath, { recursive: true });

    const isPrebuilt = Boolean(PREBUILT_ARCHIVE_S3_KEY);

    if (isPrebuilt) {
      await publishLog("Deploying prebuilt archive (no git, no build step)...");
      await downloadAndExtractArchive(PREBUILT_ARCHIVE_S3_KEY, outDirPath);
    } else {
      await new Promise((res, rej) => {
        execFile("git", ["clone", "--branch", BRANCH, GIT_REPOSITORY_URL, outDirPath], (err) => {
          if (err) rej(err);
          else res();
        });
      });
    }

    // -------------------- MONOREPO DETECTION --------------------
    try {
      const hasTurbo = fs.existsSync(path.join(outDirPath, "turbo.json"));
      const hasNx = fs.existsSync(path.join(outDirPath, "nx.json"));
      const hasPnpmWorkspace = fs.existsSync(path.join(outDirPath, "pnpm-workspace.yaml"));

      if (hasTurbo) {
        await publishLog("[Monorepo] Detected Turborepo workspace");
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(outDirPath, "package.json"), "utf8"));
          const patterns = pkg.workspaces || [];
          const detectedApps = [];
          for (const pattern of patterns) {
            const base = pattern.replace(/\/\*\*?$/, "");
            const appsDir = path.join(outDirPath, base);
            if (fs.existsSync(appsDir)) {
              const apps = fs.readdirSync(appsDir).filter((d) =>
                fs.existsSync(path.join(appsDir, d, "package.json"))
              );
              detectedApps.push(...apps.map((a) => `${base}/${a}`));
            }
          }
          if (detectedApps.length) {
            await publishLog(`[Monorepo] Found apps: ${detectedApps.join(", ")}`);
          }
        } catch (e) {
          await publishLog("[Monorepo] Could not enumerate workspaces: " + e.message);
        }
      } else if (hasNx) {
        await publishLog("[Monorepo] Detected nx workspace");
        const appsDir = path.join(outDirPath, "apps");
        if (fs.existsSync(appsDir)) {
          const detectedApps = fs.readdirSync(appsDir).filter((d) =>
            fs.existsSync(path.join(appsDir, d, "package.json"))
          );
          if (detectedApps.length) {
            await publishLog(`[Monorepo] Found apps: ${detectedApps.map((d) => `apps/${d}`).join(", ")}`);
          }
        }
      } else if (hasPnpmWorkspace) {
        await publishLog("[Monorepo] Detected pnpm workspace");
      }

      if (ROOT_DIR !== ".") {
        await publishLog(`[Monorepo] Using root directory: ${ROOT_DIR}`);
      }
    } catch (e) {
      await publishLog("[Monorepo] Detection error: " + e.message);
    }

    // -------------------- SECRET SCAN --------------------
    // Runs on the repo exactly as cloned, before we write our own injected
    // .env — scanning after that would false-positive on env vars the
    // customer intentionally configured in the dashboard.
    if (process.env.SKIP_SECRET_SCAN !== "true") {
      await publishLog("Scanning for accidentally committed secrets...");
      let findings = [];
      try {
        findings = scanForSecrets(outDirPath);
      } catch (e) {
        await publishLog("Secret scan error (non-fatal, continuing): " + e.message);
      }

      if (findings.length > 0) {
        await publishLog(`Build Failed — ${findings.length} potential secret(s) found:`);
        for (const f of findings.slice(0, 20)) {
          await publishLog(`  ${f.file}${f.line ? `:${f.line}` : ""} — ${f.pattern}`);
        }
        if (findings.length > 20) {
          await publishLog(`  ...and ${findings.length - 20} more`);
        }
        await publishLog("Remove the committed secret(s), rotate them, and push again. Set SKIP_SECRET_SCAN=true to bypass this check (not recommended).");
        process.exit(1);
      }

      await publishLog("No secrets detected.");
    }

    const USER_ENV_VARS = process.env.USER_ENV_VARS ? JSON.parse(process.env.USER_ENV_VARS) : {};
    let envContent = "";
    for (const [k, v] of Object.entries(USER_ENV_VARS)) {
      envContent += `${k}=${v}\n`;
    }
    fs.writeFileSync(path.join(outDirPath, ".env"), envContent);

    const safeEnv = { ...process.env, ...USER_ENV_VARS };
    delete safeEnv.AWS_ACCESS_KEY_ID;
    delete safeEnv.AWS_SECRET_ACCESS_KEY;
    delete safeEnv.AWS_SESSION_TOKEN;
    delete safeEnv.AWS_LAMBDA_ROLE_ARN;

    // Resolve the actual working directory (respects ROOT_DIR)
    const workDir = ROOT_DIR === "." ? outDirPath : path.join(outDirPath, ROOT_DIR);

    const buildStartTime = Date.now();

    // Everything from here on is shared by the normal build path and the
    // prebuilt-archive path — the only difference is whether cache/install/
    // build actually ran before we get here.
    async function finishDeployment() {
      await publishLog("Build Complete");

      const pkgJsonPath = path.join(workDir, "package.json");
      let isNextJs = false;
      let ssrFramework = null; // { name, standaloneDir, handler, staticSrcDirs }
      let dependencies = {};
      let devDependencies = {};

      if (fs.existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
        const deps = pkg.dependencies || {};
        if (deps.next) isNextJs = true;

        dependencies = deps;
        devDependencies = pkg.devDependencies || {};

        // Frameworks whose Node adapter produces a standalone, directly
        // runnable HTTP server directory map onto the same Lambda packaging
        // path as Next.js. Remix is deliberately excluded — its adapter model
        // varies too much (Express/Cloudflare/Deno/etc.) to safely assume a
        // standalone server.js exists; see the warning logged below for it.
        if (deps.next) {
          ssrFramework = { name: "Next.js", standaloneDir: path.join(workDir, ".next", "standalone"), handler: "server.js" };
        } else if (deps.nuxt || deps.nuxt3) {
          ssrFramework = { name: "Nuxt", standaloneDir: path.join(workDir, ".output", "server"), handler: "index.mjs", staticSrcDirs: [{ from: path.join(workDir, ".output", "public"), to: "public" }] };
        } else if (deps["@sveltejs/kit"]) {
          ssrFramework = { name: "SvelteKit", standaloneDir: path.join(workDir, "build"), handler: "index.js" };
        } else if (deps["@remix-run/node"] || deps["@remix-run/serve"]) {
          await publishLog("[SSR] Remix detected, but its adapter model (Express/Cloudflare/Deno/etc.) doesn't map onto a standalone server the way Next.js/Nuxt/SvelteKit do — skipping automatic SSR Lambda packaging. Provide a custom functions/*.js entry if you need server-side rendering on Lambda.");
        }
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

      if (ssrFramework) {
        await publishLog(`${ssrFramework.name} framework detected. Preparing SSR deployment...`);
        const { standaloneDir, handler } = ssrFramework;

        if (fs.existsSync(standaloneDir)) {
          if (ssrFramework.name === "Next.js") {
            // Copy static files into standalone so Lambda can serve them
            const staticDir = path.join(workDir, ".next", "static");
            if (fs.existsSync(staticDir)) {
              fs.cpSync(staticDir, path.join(standaloneDir, ".next", "static"), { recursive: true });
            }
            const publicDir = path.join(workDir, "public");
            if (fs.existsSync(publicDir)) {
              fs.cpSync(publicDir, path.join(standaloneDir, "public"), { recursive: true });
            }
          } else if (ssrFramework.staticSrcDirs) {
            for (const { from, to } of ssrFramework.staticSrcDirs) {
              if (fs.existsSync(from)) {
                fs.cpSync(from, path.join(standaloneDir, to), { recursive: true });
              }
            }
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
                Handler: handler,
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
          const hint = ssrFramework.name === "Next.js"
            ? "Did you add output: 'standalone' to next.config.js?"
            : ssrFramework.name === "Nuxt"
            ? "Nuxt should produce this via its default Nitro build — check your build logs above."
            : "Did you configure @sveltejs/adapter-node?";
          await publishLog(`WARNING: ${path.relative(workDir, standaloneDir)} missing. ${hint}`);
        }
      }

      // Upload static files to S3 (fallback or assets)
      await publishLog("Starting static S3 upload...");
      const candidates = [OUTPUT_DIR, "dist", "build", "out", ".next/static", ".output/public", "build/client", "public"];
      const seen = new Set();
      for (const folder of candidates) {
        if (seen.has(folder)) continue;
        seen.add(folder);
        const fullPath = path.join(workDir, folder);
        if (fs.existsSync(fullPath)) {
          await publishLog(`uploading folder: ${folder}`);
          let targetPath = s3BasePath;
          if (folder === ".next/static") targetPath = `${s3BasePath}/_next/static`;
          await uploadToS3(fullPath, targetPath);
        }
      }

      // -------------------- ANALYTICS INJECTION --------------------
      // Inject Deployr Analytics tracking snippet into index.html, then re-upload it.
      try {
        if (PROJECT_SLUG) {
          const apiUrl = process.env.APP_URL || "http://localhost:8000";
          const indexPath = path.join(workDir, OUTPUT_DIR, "index.html");
          const fallbackIndexPath = path.join(workDir, "dist", "index.html");
          const resolvedIndex = fs.existsSync(indexPath)
            ? indexPath
            : fs.existsSync(fallbackIndexPath)
            ? fallbackIndexPath
            : null;

          if (resolvedIndex) {
            let html = fs.readFileSync(resolvedIndex, "utf8");
            if (!html.includes("deployr-analytics") && html.includes("</body>")) {
              const scriptTag = `<script>(function(){var A="${apiUrl}",S="${PROJECT_SLUG}";function s(d){var b=JSON.stringify(Object.assign({projectSlug:S},d));navigator.sendBeacon?navigator.sendBeacon(A+"/collect",b):fetch(A+"/collect",{method:"POST",headers:{"Content-Type":"application/json"},body:b,keepalive:true}).catch(function(){});}s({path:location.pathname,referrer:document.referrer});if(typeof PerformanceObserver!=="undefined"){try{var po=new PerformanceObserver(function(l){var e=l.getEntries(),last=e[e.length-1];s({path:location.pathname,vitals:{lcp:last.startTime}});});po.observe({type:"largest-contentful-paint",buffered:true});}catch(e){}}})();</script>`;
              html = html.replace("</body>", scriptTag + "</body>");
              fs.writeFileSync(resolvedIndex, html);

              // Re-upload the modified index.html to S3
              const relativeKey = path.relative(path.join(workDir, OUTPUT_DIR), resolvedIndex).replace(/\\/g, "/") || "index.html";
              const reuploadCmd = new PutObjectCommand({
                Bucket: "vercel-clone-ws",
                Key: `${s3BasePath}/${relativeKey}`,
                Body: fs.createReadStream(resolvedIndex),
                ContentType: "text/html",
              });
              await s3Client.send(reuploadCmd);
              await publishLog("Injected Deployr Analytics tracking into index.html");
            }
          }
        }
      } catch (analyticsErr) {
        await publishLog("Analytics injection skipped: " + analyticsErr.message);
      }

      // -------------------- DEPLOYR FUNCTIONS --------------------
      const functionsDir = path.join(workDir, "functions");
      if (LAMBDA_ROLE && fs.existsSync(functionsDir)) {
        const fnFiles = fs.readdirSync(functionsDir).filter(f => f.endsWith('.js'));
        if (fnFiles.length > 0) {
          await publishLog(`Deployr Functions: deploying ${fnFiles.length} function(s) from functions/ directory`);
          for (const fnFile of fnFiles) {
            const fnName = path.basename(fnFile, '.js');
            const fnPath = path.join(functionsDir, fnFile);
            const fnZipPath = path.join(__dirname, `fn-${fnName}.zip`);
            const safeFnName = fnName.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 30);
            const lambdaFnName = `deployr-fn-${DEPLOYEMENT_ID.substring(0, 16)}-${safeFnName}`.substring(0, 64);
            try {
              await publishLog(`  → Packaging function: ${fnName}`);
              await zipFile(fnPath, fnZipPath);
              await lambdaClient.send(new CreateFunctionCommand({
                FunctionName: lambdaFnName,
                Runtime: 'nodejs20.x',
                Role: LAMBDA_ROLE,
                Handler: `${fnName}.handler`,
                Code: { ZipFile: fs.readFileSync(fnZipPath) },
                Timeout: 30,
                MemorySize: 256,
                Environment: Object.keys(USER_ENV_VARS).length ? { Variables: USER_ENV_VARS } : undefined,
              }));
              const fnUrlRes = await lambdaClient.send(new CreateFunctionUrlConfigCommand({
                FunctionName: lambdaFnName,
                AuthType: 'NONE',
              }));
              await lambdaClient.send(new AddPermissionCommand({
                FunctionName: lambdaFnName,
                StatementId: 'AllowPublicAccess',
                Action: 'lambda:InvokeFunctionUrl',
                Principal: '*',
                FunctionUrlAuthType: 'NONE',
              }));
              await publishLog(`FUNCTION_URL:${fnName}:${fnUrlRes.FunctionUrl}`);
              fs.rmSync(fnZipPath, { force: true });
            } catch (fnErr) {
              await publishLog(`  ✗ Function ${fnName} failed: ${fnErr.message}`);
            }
          }
        }
      }

      await publishLog("Done");
      console.log("Done");
      process.exit(0);
    }

    if (isPrebuilt) {
      await finishDeployment();
    } else {
      // -------------------- CACHE: RESTORE --------------------
      const cacheKey = computeCacheKey(workDir, INSTALL_COMMAND);
      let cacheHit = false;

      if (cacheKey) {
        await publishLog("Checking node_modules cache...");
        cacheHit = await restoreCache(cacheKey, workDir);
        if (cacheHit) {
          await publishLog("Cache restored (node_modules)");
        } else {
          await publishLog("Cache miss — running install...");
        }
      }

      // -------------------- INSTALL (skip on cache hit) --------------------
      if (!cacheHit) {
        await new Promise((resolve, reject) => {
          const installCmd = `cd ${workDir} && ${INSTALL_COMMAND}`;
          const p = exec(installCmd, { timeout: 10 * 60 * 1000, env: safeEnv });
          p.stdout.on("data", async (data) => await publishLog(data.toString()));
          p.stderr.on("data", async (data) => await publishLog(`error: ${data.toString()}`));
          p.on("close", async (code) => {
            if (code !== 0) {
              await publishLog(`Build Failed (exit code ${code})`);
              process.exit(1);
            }
            resolve();
          });
        });

        // -------------------- CACHE: SAVE (after successful install) --------------------
        if (cacheKey) {
          saveCache(cacheKey, workDir); // fire and forget — no await
        }
      }

      // -------------------- BUILD --------------------
      const buildCmd = `cd ${workDir} && ${BUILD_COMMAND}`;
      const p = exec(buildCmd, { timeout: 10 * 60 * 1000, env: safeEnv });

      p.stdout.on("data", async (data) => await publishLog(data.toString()));
      p.stderr.on("data", async (data) => await publishLog(`error: ${data.toString()}`));

      let buildStderr = "";
      p.stderr.on("data", async (data) => {
        const chunk = data.toString();
        buildStderr += chunk;
      });

      p.on("close", async (code) => {
        if (code !== 0) {
          await publishLog(`Build Failed (exit code ${code})`);
          if (buildStderr.includes("Cannot find module") || buildStderr.includes("Module not found")) {
            await publishLog("Hint: A module dependency is missing. Check your package.json and ensure all imports resolve correctly.");
          } else if (buildStderr.includes("ENOMEM") || buildStderr.includes("heap out of memory")) {
            await publishLog("Hint: Build ran out of memory. Try setting NODE_OPTIONS=--max_old_space_size=4096 in your environment variables.");
          } else if (buildStderr.includes("SyntaxError") || buildStderr.includes("Unexpected token")) {
            await publishLog("Hint: Syntax error in your source code. Check the file and line number reported above.");
          } else if (buildStderr.includes("ENOENT") && buildStderr.includes("package.json")) {
            await publishLog("Hint: package.json not found. Make sure your Root Directory is set correctly (e.g., apps/web for a monorepo).");
          } else if (buildStderr.includes("Type error") || buildStderr.includes("TS")) {
            await publishLog("Hint: TypeScript compilation failed. Run `tsc --noEmit` locally to see all type errors.");
          }
          process.exit(1);
          return;
        }
        await finishDeployment();
      });
    }
  } catch (err) {
    await publishLog(`FATAL: ${err.message}`);
    process.exit(1);
  }
}

init();