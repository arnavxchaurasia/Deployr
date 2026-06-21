require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");

const prisma = new PrismaClient();
const ecsClient = new ECSClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const CLUSTER = "arn:aws:ecs:us-east-1:097457367826:cluster/builder-cluster-ws";
const TASK = "arn:aws:ecs:us-east-1:097457367826:task-definition/builder-task";

async function testDeploy() {
  const project = await prisma.project.findFirst();
  if (!project) return console.log("No projects found");

  const command = new RunTaskCommand({
      cluster: CLUSTER,
      taskDefinition: TASK,
      launchType: "FARGATE",
      networkConfiguration: {
        awsvpcConfiguration: {
          assignPublicIp: "ENABLED",
          subnets: ["subnet-0c880cd48957e3b04", "subnet-0a8f5863458162f15", "subnet-0df491ac14b434dc5"],
          securityGroups: ["sg-07baa83f9ed7f4ba4"],
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: "builder-image",
            environment: [
              { name: "GIT_REPOSITORY_URL", value: project.gitURL },
              { name: "PROJECT_ID", value: project.id },
              { name: "DEPLOYEMENT_ID", value: "test-deploy-123" },
              { name: "BRANCH", value: "main" },
              { name: "USER_ENV_VARS", value: "{}" },
            ],
          },
        ],
      },
  });

  try {
    const result = await ecsClient.send(command);
    console.log("ECS Trigger Result:", result.tasks?.[0]?.taskArn);
  } catch (err) {
    console.error("ECS Trigger Failed:", err);
  }
}

testDeploy().finally(() => prisma.$disconnect());
