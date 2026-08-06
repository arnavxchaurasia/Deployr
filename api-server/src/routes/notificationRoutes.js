'use strict';

const express = require('express');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, read: false },
    });
    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.get('/notifications/unread-count', authMiddleware, async (req, res) => {
  try {
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, read: false },
    });
    res.json({ unreadCount });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

router.post('/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { read: true },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

router.post('/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

module.exports = router;
