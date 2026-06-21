const { ECSClient, RunTaskCommand, StopTaskCommand } = require("@aws-sdk/client-ecs");

const ecsClient = new ECSClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const CLUSTER = "arn:aws:ecs:us-east-1:097457367826:cluster/builder-cluster-ws";
const TASK = "arn:aws:ecs:us-east-1:097457367826:task-definition/builder-task";

module.exports = {
  ecsClient,
  RunTaskCommand,
  StopTaskCommand,
  CLUSTER,
  TASK
};
