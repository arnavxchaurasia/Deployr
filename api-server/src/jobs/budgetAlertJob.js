'use strict';

const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');
const { notify } = require('../services/notificationService');
const { sendOrgWebhook } = require('../services/orgWebhookService');
const { BUILD_MINUTES_QUOTA, getBuildMinutesUsed, sumBuildMinutes } = require('../services/quotaService');

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes — quota doesn't need minute-level freshness
const THRESHOLDS = [80, 100]; // percent of plan quota

// Alerts fire once per (subject, threshold, calendar month) — re-checking on
// every job tick would otherwise re-notify every 15 minutes for the rest of
// the month once a threshold is crossed. We track that by checking for an
// existing Notification with matching meta instead of a dedicated table.
function currentPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function alreadyNotified(userId, subjectType, subjectId, threshold, period) {
  // Matching on JSON meta fields isn't portably filterable at the query
  // level across Prisma's providers, so pull recent rows for this user+type
  // and check in JS — the window (32 days) keeps this cheap.
  const recent = await prisma.notification.findMany({
    where: { userId, type: 'usage.budget_alert', createdAt: { gte: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000) } },
    select: { meta: true },
  });
  return recent.some(
    (n) => n.meta?.subjectType === subjectType && n.meta?.subjectId === subjectId && n.meta?.threshold === threshold && n.meta?.period === period
  );
}

// Returns the list of thresholds actually newly crossed (and notified) this
// tick, so a caller managing a shared subject (e.g. an org with several
// admins) can fire a single webhook rather than one per recipient.
async function maybeAlert({ userId, subjectType, subjectId, subjectName, used, limit }) {
  if (limit == null || limit <= 0) return []; // unlimited plan
  const pct = (used / limit) * 100;
  const period = currentPeriod();
  const fired = [];

  for (const threshold of THRESHOLDS) {
    if (pct < threshold) continue;
    if (await alreadyNotified(userId, subjectType, subjectId, threshold, period)) continue;

    const label = threshold >= 100 ? 'exceeded' : `crossed ${threshold}%`;
    await notify(userId, {
      type: 'usage.budget_alert',
      title: `${subjectName}: build-minute budget ${label}`,
      body: `${Math.round(used)} of ${limit} build minutes used this month (${Math.round(pct)}%).`,
      meta: { subjectType, subjectId, threshold, period, used: Math.round(used), limit },
    });
    fired.push(threshold);
  }

  return fired;
}

async function checkBudgets() {
  try {
    // ── Personal (non-org) plans ──────────────────────────────────────────────
    const users = await prisma.user.findMany({
      where: { plan: { in: ['FREE', 'PRO'] } },
      select: { id: true, name: true, email: true, plan: true },
    });

    for (const user of users) {
      const limit = BUILD_MINUTES_QUOTA[user.plan] ?? BUILD_MINUTES_QUOTA.FREE;
      const used = await getBuildMinutesUsed(user.id);
      await maybeAlert({
        userId: user.id,
        subjectType: 'user',
        subjectId: user.id,
        subjectName: user.name || user.email,
        used,
        limit,
      });
    }

    // ── Org (seat-based) plans ────────────────────────────────────────────────
    const orgs = await prisma.organization.findMany({
      where: { plan: { in: ['FREE', 'PRO'] } },
      select: {
        id: true,
        name: true,
        plan: true,
        memberships: { where: { role: { in: ['OWNER', 'ADMIN'] } }, select: { userId: true } },
      },
    });

    for (const org of orgs) {
      const limit = BUILD_MINUTES_QUOTA[org.plan] ?? BUILD_MINUTES_QUOTA.FREE;
      const used = await sumBuildMinutes({ project: { orgId: org.id } });

      const newlyCrossed = new Set();
      for (const membership of org.memberships) {
        const fired = await maybeAlert({
          userId: membership.userId,
          subjectType: 'org',
          subjectId: org.id,
          subjectName: org.name,
          used,
          limit,
        });
        fired.forEach((t) => newlyCrossed.add(t));
      }

      for (const threshold of newlyCrossed) {
        sendOrgWebhook(org.id, 'usage.budget_alert', {
          threshold,
          used: Math.round(used),
          limit,
        }).catch(() => {});
      }
    }
  } catch (err) {
    logger.error({ err }, '[BudgetAlert] Check failed');
  }
}

function startBudgetAlertJob() {
  checkBudgets();
  const timer = setInterval(checkBudgets, CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = { startBudgetAlertJob };
