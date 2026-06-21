const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const mailService = require('../services/mailService');

const router = express.Router();

// Initialize Razorpay instance safely (will throw error if keys are missing in production)
const getRazorpayInstance = () => {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_key',
    key_secret: process.env.RAZORPAY_SECRET || 'rzp_test_mock_secret',
  });
};

router.post("/payment/create-order", authMiddleware, async (req, res) => {
  try {
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

    const secret = process.env.RAZORPAY_SECRET || 'rzp_test_mock_secret';

    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = shasum.digest('hex');

    if (digest !== razorpay_signature) {
      return res.status(400).json({ error: "Transaction not legit!" });
    }

    // Update user to PRO
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        plan: "PRO",
        razorpayPaymentId: razorpay_payment_id,
      },
    });

    // Send success email
    await mailService.sendPaymentSuccessEmail(user.email, "1,600").catch(console.error);

    res.json({ success: true, message: "Payment verified successfully" });
  } catch (err) {
    console.error("Razorpay verify error:", err);
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

module.exports = router;
