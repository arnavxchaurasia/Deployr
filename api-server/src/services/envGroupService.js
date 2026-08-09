'use strict';

const { prisma } = require('../../lib/prisma');
const { decrypt } = require('../../lib/crypto');

// Flattened env vars from every EnvGroup attached to a project, decrypted
// and merged in attachment order (later-attached groups win on key
// collisions between groups — arbitrary but deterministic; a project's own
// EnvironmentVariable always wins over any group, applied by the caller).
async function getProjectEnvGroupVars(projectId) {
  const links = await prisma.projectEnvGroup.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    include: { group: { include: { variables: true } } },
  });

  const env = {};
  for (const link of links) {
    for (const v of link.group.variables) {
      env[v.key] = decrypt(v.value);
    }
  }
  return env;
}

module.exports = { getProjectEnvGroupVars };
