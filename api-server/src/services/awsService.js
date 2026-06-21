const { ECSClient, RunTaskCommand, StopTaskCommand } = require("@aws-sdk/client-ecs");

const ecsClient = new ECSClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const originalSend = ecsClient.send.bind(ecsClient);
ecsClient.send = async (command) => {
  if (command.constructor.name === 'RunTaskCommand') {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const count = await prisma.deployment.count({
      where: { createdAt: { gte: startOfMonth } }
    });

    const MAX_DEPLOYMENTS = parseInt(process.env.MAX_MONTHLY_DEPLOYMENTS || "50", 10);
    if (count >= MAX_DEPLOYMENTS) {
      console.log(`AWS Usage Limit Reached. Blocking RunTaskCommand. Monthly deployments: ${count}`);
      throw new Error(`AWS Free Tier limit reached. Max ${MAX_DEPLOYMENTS} deployments allowed per month.`);
    }
  }
  return originalSend(command);
};

const CLUSTER = "arn:aws:ecs:us-east-1:097457367826:cluster/builder-cluster-ws";
const TASK = "arn:aws:ecs:us-east-1:097457367826:task-definition/builder-task";

module.exports = {
  ecsClient,
  RunTaskCommand,
  StopTaskCommand,
  CLUSTER,
  TASK
};
