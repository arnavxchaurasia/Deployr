const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { rateLimit } = require('../middlewares/rateLimitMiddleware');
const mailService = require('../services/mailService');
const { checkBuildQuota } = require('../services/quotaService');

const router = express.Router();

if (process.env.NODE_ENV === 'production' && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET)) {
  throw new Error('RAZORPAY_KEY_ID and RAZORPAY_SECRET must be set in production');
}

const getRazorpayInstance = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_SECRET) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_SECRET.');
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET,
  });
};

router.post("/payment/create-order", authMiddleware, async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.ip;
    if (!(await rateLimit(`payment-${req.user.id}-${ip}`, 5, 10 * 60_000))) {
      return res.status(429).json({ error: "Too many payment requests. Try again later." });
    }

    const rzp = getRazorpayInstance();
    const amountInPaise = 160000; // ₹1600

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `rcpt_${Date.now()}_${req.user.id.slice(0, 8)}`,
    };

    const order = await rzp.orders.create(options);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { razorpayOrderId: order.id },
    });

    res.json({ success: true, orderId: order.id, amount: options.amount, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error("Razorpay order error:", err);
    res.status(500).json({ error: "Failed to create payment order" });
  }
});

router.post("/payment/verify", authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const secret = process.env.RAZORPAY_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "Payment verification is not configured" });
    }

    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = shasum.digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(razorpay_signature))) {
      return res.status(400).json({ error: "Transaction not legit!" });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        plan: "PRO",
        razorpayPaymentId: razorpay_payment_id,
      },
    });

    await mailService.sendPaymentSuccessEmail(user.email, "1,600").catch(console.error);

    res.json({ success: true, message: "Payment verified successfully" });
  } catch (err) {
    console.error("Razorpay verify error:", err);
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

router.get("/usage", authMiddleware, async (req, res) => {
  try {
    const quota = await checkBuildQuota({ userId: req.user.id });
    res.json({
      plan: quota.plan,
      buildMinutesUsed: Math.round(quota.used * 10) / 10,
      buildMinutesLimit: quota.limit,
      quotaExceeded: !quota.allowed,
    });
  } catch (err) {
    console.error("Usage fetch error:", err);
    res.status(500).json({ error: "Failed to fetch usage" });
  }
});

router.post("/payment/cancel", authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { plan: true, email: true, name: true },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.plan === "FREE") {
      return res.status(400).json({ error: "No active subscription to cancel" });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        plan: "FREE",
        razorpayOrderId: null,
        razorpayPaymentId: null,
      },
    });

    // Send cancellation email (best-effort)
    mailService.sendEmail?.({
      to: user.email,
      subject: "Your Deployr Pro subscription has been cancelled",
      text: `Hi ${user.name || 'there'},\n\nYour Pro subscription has been cancelled. You've been moved to the Hobby plan.\n\nThanks for using Deployr.`,
    }).catch(() => {});

    res.json({ success: true, message: "Subscription cancelled. You are now on the Hobby plan." });
  } catch (err) {
    console.error("Cancel subscription error:", err);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

module.exports = router;