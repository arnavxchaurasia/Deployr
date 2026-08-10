'use strict';

const { prisma } = require('../../lib/prisma');

/**
 * Return cache statistics for a project.
 */
async function getCacheStats(projectId) {
  const entries = await prisma.buildCache.findMany({
    where: { projectId },
    orderBy: { lastUsedAt: 'desc' },
  });

  const totalSizeBytes = entries.reduce((sum, e) => sum + (e.sizeBytes || 0), 0);
  const totalHits = entries.reduce((sum, e) => sum + (e.hitCount || 0), 0);

  return {
    totalEntries: entries.length,
    totalSizeBytes,
    totalHits,
    entries,
  };
}

/**
 * Increment hitCount and update lastUsedAt for a matching cache entry.
 */
async function recordCacheHit(projectId, cacheKey) {
  await prisma.buildCache.updateMany({
    where: { projectId, cacheKey },
    data: {
      hitCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
}

/**
 * Upsert a cache entry.
 */
async function recordNewCache(projectId, cacheKey, s3Key, sizeBytes) {
  return prisma.buildCache.upsert({
    where: { projectId_cacheKey: { projectId, cacheKey } },
    update: { s3Key, sizeBytes, lastUsedAt: new Date() },
    create: { projectId, cacheKey, s3Key, sizeBytes, hitCount: 0, lastUsedAt: new Date() },
  });
}

/**
 * Delete oldest entries beyond keepCount for a project.
 */
async function pruneOldCaches(projectId, keepCount = 5) {
  const entries = await prisma.buildCache.findMany({
    where: { projectId },
    orderBy: { lastUsedAt: 'desc' },
    select: { id: true },
  });

  const toDelete = entries.slice(keepCount).map((e) => e.id);
  if (toDelete.length === 0) return { deleted: 0 };

  const { count } = await prisma.buildCache.deleteMany({
    where: { id: { in: toDelete } },
  });

  return { deleted: count };
}

module.exports = { getCacheStats, recordCacheHit, recordNewCache, pruneOldCaches };
