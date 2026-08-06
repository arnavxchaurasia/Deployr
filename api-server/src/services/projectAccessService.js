'use strict';

const { prisma } = require('../../lib/prisma');

// Projects created solo (no orgId) are only ever accessible by their creator
// — that case is unaffected. Org-owned projects should be reachable by any
// member of the owning org, scaled by role: MEMBER can view/deploy, ADMIN
// can also change settings/domains, OWNER can do anything an ADMIN can plus
// org-level management (handled separately in orgRoutes.js).
const ROLE_RANK = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

/**
 * Resolve a user's effective role on a project: the literal creator is
 * always OWNER (an override can't touch the creator's own project); a
 * per-project ProjectMemberOverride, if one exists for this user, wins over
 * their org role — letting an org owner grant a MEMBER elevated ADMIN
 * access to just this one project, or restrict an org ADMIN down to MEMBER
 * on a project they shouldn't fully manage. With no override, falls back
 * to the org membership role as before. Returns null if the user has no
 * access at all.
 *
 * @returns {Promise<{ project: object, role: string } | null>}
 */
async function getProjectAccess(userId, projectId) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;

  if (project.userId === userId) {
    return { project, role: 'OWNER' };
  }

  const override = await prisma.projectMemberOverride.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (override) return { project, role: override.role };

  if (project.orgId) {
    const membership = await prisma.organizationMembership.findUnique({
      where: { orgId_userId: { orgId: project.orgId, userId } },
    });
    if (membership) return { project, role: membership.role };
  }

  return null;
}

/**
 * Same as getProjectAccess, but returns null unless the resolved role meets
 * or exceeds minRole (MEMBER < ADMIN < OWNER).
 */
async function requireProjectAccess(userId, projectId, minRole = 'MEMBER') {
  const access = await getProjectAccess(userId, projectId);
  if (!access) return null;
  if (ROLE_RANK[access.role] < ROLE_RANK[minRole]) return null;
  return access;
}

// Spreadable Prisma `where` fragment granting access to either the
// project's literal creator, a per-project ProjectMemberOverride whose role
// meets minRole, or (when no override exists for this user) any org member
// whose org role meets minRole — mirrors getProjectAccess's precedence so a
// restrictive override actually excludes the project even for an org
// ADMIN/OWNER, not just a note the UI ignores.
// For use as `prisma.project.findFirst({ where: { id, ...projectAccessWhere(userId, 'ADMIN') } })`,
// a drop-in replacement for the old creator-only `{ id, userId }` filter.
function projectAccessWhere(userId, minRole = 'MEMBER') {
  const rolesAtOrAbove = Object.keys(ROLE_RANK).filter((r) => ROLE_RANK[r] >= ROLE_RANK[minRole]);
  return {
    OR: [
      { userId },
      { memberOverrides: { some: { userId, role: { in: rolesAtOrAbove } } } },
      {
        AND: [
          { memberOverrides: { none: { userId } } },
          { org: { memberships: { some: { userId, role: { in: rolesAtOrAbove } } } } },
        ],
      },
    ],
  };
}

module.exports = { ROLE_RANK, getProjectAccess, requireProjectAccess, projectAccessWhere };
