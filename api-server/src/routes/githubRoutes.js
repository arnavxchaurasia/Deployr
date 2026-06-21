const express = require('express');
const { prisma } = require('../../lib/prisma');
const { getIO } = require('../utils/socket');

const router = express.Router();

router.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;

    const repoUrl = payload.repository?.html_url;
    if (!repoUrl) return res.sendStatus(200);

    const project = await prisma.project.findFirst({
      where: { gitURL: repoUrl },
      include: { environmentVariables: true },
    });

    if (!project) return res.sendStatus(200);

    // 1. Handle PUSH events
    if (payload.ref) {
      const branch = payload.ref.replace("refs/heads/", "");
      const commitMessage = payload.head_commit?.message || "New commit pushed";

      getIO().to(`user:${project.userId}`).emit("github_commit_pushed", {
        projectId: project.id,
        projectName: project.name,
        branch,
        commitMessage
      });
      console.log(`Webhook popup triggered for ${project.name} (user:${project.userId})`);
      return res.sendStatus(200);
    }

    // 2. Handle PULL_REQUEST events (Epic 4: Branch Previews)
    if (payload.action === "opened" || payload.action === "synchronize") {
      const pr = payload.pull_request;
      if (!pr) return res.sendStatus(200);

      const branch = pr.head.ref;
      const commitHash = pr.head.sha;

      console.log(`[PR Webhook] Triggering preview deployment for ${project.name} on branch ${branch}`);

      // Create queued deployment
      const deployment = await prisma.deployment.create({
        data: {
          projectId: project.id,
          status: "QUEUED",
          isActive: false,
          branch: branch,
          commitHash: commitHash,
          trigger: "WEBHOOK",
          startedAt: new Date(),
        },
      });

      const userEnvVarsObj = {};
      if (project.environmentVariables) {
        const { decrypt } = require('../../lib/crypto');
        for (const e of project.environmentVariables) {
          userEnvVarsObj[e.key] = decrypt(e.value);
        }
      }

      // Trigger ECS build
      const { ecsClient, CLUSTER, TASK, RunTaskCommand } = require('../services/awsService');
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
                { name: "PROJECT_ID", value: project.id },
                { name: "DEPLOYEMENT_ID", value: deployment.id },
                { name: "BRANCH", value: branch },
                { name: "USER_ENV_VARS", value: JSON.stringify(userEnvVarsObj) },
                { name: "AWS_LAMBDA_ROLE_ARN", value: "arn:aws:iam::097457367826:role/DeployrLambdaExecutionRole" },
              ],
            },
          ],
        },
      });

      try {
        const result = await ecsClient.send(command);
        const taskArn = result.tasks?.[0]?.taskArn;

        if (taskArn) {
          await prisma.deployment.update({
            where: { id: deployment.id },
            data: { taskArn },
          });
        }

        // Mock GitHub PR Commenting
        console.log(`\n=================================`);
        console.log(`[GITHUB PR MOCK COMMENT]`);
        console.log(`PR: #${pr.number} (${repoUrl}/pull/${pr.number})`);
        console.log(`✅ Preview Deployment Triggered!`);
        console.log(`Track it here: http://localhost:3000/dashboard/projects/${project.id}/deployments`);
        console.log(`=================================\n`);

      } catch (ecsErr) {
        console.error("Failed to start ECS task for PR:", ecsErr);
        await prisma.deployment.update({
          where: { id: deployment.id },
          data: { status: "FAILED" },
        });
      }

      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "Webhook failed" });
  }
});

module.exports = router;