'use strict';

const { prisma } = require('../../lib/prisma');
const { getRegionConfig, DeleteFunctionCommand, s3Client, ListObjectsV2Command, DeleteObjectsCommand, S3_BUCKET } = require('./awsService');
const { destroyPreviewDatabase } = require('./previewDatabaseService');

async function deleteS3Prefix(prefix) {
  let continuationToken;
  do {
    const listed = await s3Client.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    if (listed.Contents?.length) {
      await s3Client.send(new DeleteObjectsCommand({
        Bucket: S3_BUCKET,
        Delete: { Objects: listed.Contents.map((obj) => ({ Key: obj.Key })) },
      }));
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}

// Lambda function names are deterministic (see server/script.js), so they
// can be reconstructed from the deployment id without persisting them
// separately — matches the SSR function and every functions/*.js function.
async function deleteLambdaFunctionsFor(deployment) {
  const names = [];

  if (deployment.functionUrl) {
    names.push(`deployr-${deployment.id.substring(0, 32)}`);
  }
  if (deployment.functionUrls) {
    for (const fnName of Object.keys(deployment.functionUrls)) {
      const safeFnName = fnName.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 30);
      names.push(`deployr-fn-${deployment.id.substring(0, 16)}-${safeFnName}`.substring(0, 64));
    }
  }

  // The function was created in whichever region the deployment ran in
  // (see AWS_REGION override in deployTriggerService) — must delete from
  // the same region or it's a silent no-op that leaks the real resource.
  const { lambdaClient } = getRegionConfig(deployment.region);

  for (const FunctionName of names) {
    try {
      await lambdaClient.send(new DeleteFunctionCommand({ FunctionName }));
    } catch (err) {
      // Already gone, or was never actually created (e.g. build failed after
      // logging the URL) — non-fatal either way.
      if (err.name !== 'ResourceNotFoundException') {
        console.warn(`[Cleanup] Failed to delete Lambda ${FunctionName}: ${err.message}`);
      }
    }
  }
}

/**
 * Fully tear down a deployment: its Lambda function(s), S3 output assets,
 * and the DB row itself. Used for manual deletion, retention pruning, and
 * automatic preview cleanup when a PR/MR closes.
 */
async function cleanupDeployment(deployment) {
  await deleteLambdaFunctionsFor(deployment);
  await deleteS3Prefix(`__outputs/${deployment.projectId}/${deployment.id}/`);

  // Tear down any ephemeral preview database — fetched lazily rather than
  // requiring every caller's select to include isPreview/project fields,
  // since cleanup isn't a hot path.
  if (deployment.isPreview !== false) {
    const full = await prisma.deployment.findUnique({
      where: { id: deployment.id },
      select: { isPreview: true, project: { select: { previewDbProvisionWebhookUrl: true } } },
    });
    if (full?.isPreview && full.project?.previewDbProvisionWebhookUrl) {
      await destroyPreviewDatabase(full.project.previewDbProvisionWebhookUrl, {
        projectId: deployment.projectId, deploymentId: deployment.id,
      });
    }
  }

  await prisma.deployment.delete({ where: { id: deployment.id } });
}

module.exports = { deleteS3Prefix, deleteLambdaFunctionsFor, cleanupDeployment };
