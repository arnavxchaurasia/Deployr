'use strict';

const { prisma } = require('../../lib/prisma');
const logger = require('../../lib/logger');

/**
 * Create an in-app notification. Never throws — a notification failing to
 * write should never break the deploy/build flow it's describing.
 */
async function notify(userId, { type, title, body, meta } = {}) {
  if (!userId) return;
  try {
    await prisma.notification.create({
      data: { userId, type, title, body: body ?? null, meta: meta ?? undefined },
    });
  } catch (err) {
    logger.warn({ err }, '[Notification] Failed to write notification');
  }
}

module.exports = { notify };
