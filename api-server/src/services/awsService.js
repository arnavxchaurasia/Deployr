const logger = require("../../lib/logger");
const { ECSClient, RunTaskCommand, StopTaskCommand } = require("@aws-sdk/client-ecs");
const { LambdaClient, DeleteFunctionCommand } = require("@aws-sdk/client-lambda");
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");

const ecsClient = new ECSClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const lambdaClient = new LambdaClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Single shared S3 client — previously each of authRoutes.js, projectRoutes.js,
// and deploymentCleanupService.js constructed their own `new S3Client(...)`.
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET = process.env.S3_BUCKET || "vercel-clone-ws";

// Applies the monthly-deployment-cap guard to any ECS client — the default
// one and any per-region client getRegionConfig() creates — so the cap
// can't be bypassed just by deploying to a different region.
function guardEcsClient(client) {
  const originalSend = client.send.bind(client);
  client.send = async (command) => {
    if (command.constructor.name === 'RunTaskCommand') {
      const { prisma } = require('../../lib/prisma');

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const count = await prisma.deployment.count({
        where: { createdAt: { gte: startOfMonth } }
      });

      const MAX_DEPLOYMENTS = parseInt(process.env.MAX_MONTHLY_DEPLOYMENTS || "50", 10);
      if (count >= MAX_DEPLOYMENTS) {
        logger.warn(`AWS Usage Limit Reached. Blocking RunTaskCommand. Monthly deployments: ${count}`);
        throw new Error(`AWS Free Tier limit reached. Max ${MAX_DEPLOYMENTS} deployments allowed per month.`);
      }
    }
    return originalSend(command);
  };
  return client;
}

guardEcsClient(ecsClient);

const CLUSTER = process.env.ECS_CLUSTER_ARN || "arn:aws:ecs:us-east-1:097457367826:cluster/builder-cluster-ws";
const TASK = process.env.ECS_TASK_ARN || "arn:aws:ecs:us-east-1:097457367826:task-definition/builder-task";
const SUBNETS = (process.env.ECS_SUBNETS || "subnet-0c880cd48957e3b04,subnet-0a8f5863458162f15,subnet-0df491ac14b434dc5")
  .split(",").map(s => s.trim());
const SECURITY_GROUP = process.env.ECS_SECURITY_GROUP || "sg-07baa83f9ed7f4ba4";
const LAMBDA_EXECUTION_ROLE_ARN = process.env.LAMBDA_EXECUTION_ROLE_ARN || "arn:aws:iam::097457367826:role/DeployrLambdaExecutionRole";

const DEFAULT_REGION = "us-east-1";
const AVAILABLE_REGIONS = (process.env.AVAILABLE_REGIONS || DEFAULT_REGION).split(",").map((r) => r.trim());

const regionConfigCache = new Map();
const warnedFallback = new Set();

// Multi-region foundation: a project can be pinned to a region, and its
// builds/Lambda functions run there instead of always us-east-1 — as long
// as that region's env vars are configured. Any region without dedicated
// env vars silently falls back to the default region's config, so adding
// AVAILABLE_REGIONS entries without configuring them yet never breaks
// anything; it just doesn't actually deploy there until you do.
function envSuffix(region) {
  return region.toUpperCase().replace(/-/g, "_");
}

function getRegionConfig(region) {
  const key = region || DEFAULT_REGION;
  if (regionConfigCache.has(key)) return regionConfigCache.get(key);

  const suffix = envSuffix(key);
  const clusterArn = process.env[`ECS_CLUSTER_ARN_${suffix}`];

  let config;
  if (key === DEFAULT_REGION || !clusterArn) {
    if (key !== DEFAULT_REGION && !warnedFallback.has(key)) {
      warnedFallback.add(key);
      logger.warn(`[awsService] Region "${key}" has no ECS_CLUSTER_ARN_${suffix} configured — falling back to ${DEFAULT_REGION}`);
    }
    config = {
      region: DEFAULT_REGION,
      ecsClient,
      lambdaClient,
      CLUSTER,
      TASK,
      SUBNETS,
      SECURITY_GROUP,
      LAMBDA_EXECUTION_ROLE_ARN,
    };
  } else {
    const credentials = {
      accessKeyId: process.env[`AWS_ACCESS_KEY_ID_${suffix}`] || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env[`AWS_SECRET_ACCESS_KEY_${suffix}`] || process.env.AWS_SECRET_ACCESS_KEY,
    };
    config = {
      region: key,
      ecsClient: guardEcsClient(new ECSClient({ region: key, credentials })),
      lambdaClient: new LambdaClient({ region: key, credentials }),
      CLUSTER: clusterArn,
      TASK: process.env[`ECS_TASK_ARN_${suffix}`] || TASK,
      SUBNETS: (process.env[`ECS_SUBNETS_${suffix}`] || SUBNETS.join(",")).split(",").map((s) => s.trim()),
      SECURITY_GROUP: process.env[`ECS_SECURITY_GROUP_${suffix}`] || SECURITY_GROUP,
      LAMBDA_EXECUTION_ROLE_ARN: process.env[`LAMBDA_EXECUTION_ROLE_ARN_${suffix}`] || LAMBDA_EXECUTION_ROLE_ARN,
    };
  }

  regionConfigCache.set(key, config);
  return config;
}

module.exports = {
  ecsClient,
  RunTaskCommand,
  StopTaskCommand,
  lambdaClient,
  DeleteFunctionCommand,
  s3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  S3_BUCKET,
  CLUSTER,
  TASK,
  SUBNETS,
  SECURITY_GROUP,
  LAMBDA_EXECUTION_ROLE_ARN,
  DEFAULT_REGION,
  AVAILABLE_REGIONS,
  getRegionConfig,
};
