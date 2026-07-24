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
    const { prisma } = require('../../lib/prisma');
    
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

const CLUSTER = process.env.ECS_CLUSTER_ARN || "arn:aws:ecs:us-east-1:097457367826:cluster/builder-cluster-ws";
const TASK = process.env.ECS_TASK_ARN || "arn:aws:ecs:us-east-1:097457367826:task-definition/builder-task";
const SUBNETS = (process.env.ECS_SUBNETS || "subnet-0c880cd48957e3b04,subnet-0a8f5863458162f15,subnet-0df491ac14b434dc5")
  .split(",").map(s => s.trim());
const SECURITY_GROUP = process.env.ECS_SECURITY_GROUP || "sg-07baa83f9ed7f4ba4";
const LAMBDA_EXECUTION_ROLE_ARN = process.env.LAMBDA_EXECUTION_ROLE_ARN || "arn:aws:iam::097457367826:role/DeployrLambdaExecutionRole";

module.exports = {
  ecsClient,
  RunTaskCommand,
  StopTaskCommand,
  CLUSTER,
  TASK,
  SUBNETS,
  SECURITY_GROUP,
  LAMBDA_EXECUTION_ROLE_ARN,
};
