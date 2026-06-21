const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { rateLimit } = require('../middlewares/rateLimitMiddleware');
const { encrypt, decrypt } = require('../../lib/crypto');
const crypto = require('crypto');
const dns = require('dns/promises');
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const bcrypt = require('bcryptjs');
const { ecsClient, CLUSTER, TASK, RunTaskCommand } = require('../services/awsService');
const mailService = require('../services/mailService');
const UAParser = require('ua-parser-js');

const router = express.Router();

// Helper to log sessions
async function logSession(req, userId) {
  try {
    const parser = new UAParser(req.headers['user-agent'] || '');
    const result = parser.getResult();
    
    const deviceName = result.device.vendor 
      ? `${result.device.vendor} ${result.device.model || ''}`.trim()
      : result.os.name === 'Mac OS' ? 'Apple Mac' : 'Desktop PC';
      
    const os = result.os.name || 'Unknown OS';
    const browser = result.browser.name || 'Unknown Browser';
    
    // We get IP from x-forwarded-for or req.ip
    const ip = req.headers['x-forwarded-for'] || req.ip || '127.0.0.1';

    await prisma.loginSession.create({
      data: {
        userId,
        ip,
        userAgent: req.headers['user-agent'] || 'Unknown',
        device: deviceName,
        os,
        browser,
      }
    });
  } catch (err) {
    console.error("Failed to log session:", err);
  }
}

router.post("/auth/signup", async (req, res) => {
  const ip = req.ip;

  if (!rateLimit(`signup-${ip}`, 50, 60_000)) {
    return res.status(429).json({ error: "Too many signups. Try later." });
  }

  const schema = z.object({
    name: z.string().min(2, "Name too short"),
    email: z.string().email("Invalid email"),
    password: z
      .string()
      .min(8, "Must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a number")
      .regex(/[^A-Za-z0-9]/, "Must contain a symbol"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(400).json({ error: "Email already in use" });
  }

  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      emailVerified: false, // important
    },
  });

  // Create 6-digit numeric OTP
  const verifyToken = Math.floor(100000 + Math.random() * 900000).toString();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      verifyToken,
      verifyTokenExpiry: new Date(Date.now() + 1000 * 60 * 15), // 15 mins for OTP
    },
  });

  await mailService.sendOTPEmail(email, verifyToken).catch(console.error);

  res.json({
    success: true,
    message: "Signup successful. Please verify your email.",
    devOtp: process.env.NODE_ENV !== "production" ? verifyToken : undefined,
  });
});

router.post("/auth/login", async (req, res) => {
  const ip = req.ip;

  if (!rateLimit(`login-${ip}`, 5, 60_000)) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.password) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Record login session
  await logSession(req, user.id);

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
  });
});

router.post("/auth/verify-otp", async (req, res) => {
  const ip = req.ip;

  if (!rateLimit(`verify-otp-${ip}`, 10, 60_000)) {
    return res.status(429).json({ error: "Too many attempts. Try later." });
  }

  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  
  if (!user || user.emailVerified) {
    return res.status(400).json({ error: "User not found or already verified" });
  }

  if (
    user.verifyToken !== otp ||
    !user.verifyTokenExpiry ||
    new Date() > user.verifyTokenExpiry
  ) {
    return res.status(400).json({ error: "Invalid or expired OTP" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verifyToken: null,
      verifyTokenExpiry: null,
    },
  });

  await mailService.sendWelcomeEmail(user.email, user.name).catch(console.error);

  res.json({ success: true, message: "Email verified successfully" });
});

router.post("/auth/request-password-reset", async (req, res) => {
  const ip = req.ip;

  if (!rateLimit(`reset-${ip}`, 5, 60_000)) {
    return res.status(429).json({ error: "Too many requests. Try later." });
  }

  const { email } = req.body;
  if (!email) return res.json({ success: true });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.json({ success: true });

  const token = crypto.randomBytes(32).toString("hex");

  // 🔥 overwrite old token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken: token,
      resetTokenExpiry: new Date(Date.now() + 1000 * 60 * 10), // 10 min
    },
  });

  await mailService.sendPasswordResetEmail(email, token).catch(console.error);

  res.json({ success: true });
});

router.post("/auth/reset-password", async (req, res) => {
  const schema = z.object({
  token: z.string(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
});

const parsed = schema.safeParse(req.body);
if (!parsed.success) return res.status(400).json({ error: "Weak password" });

const { token, password } = parsed.data;


  if (!token || !password) {
    return res.status(400).json({ error: "Missing data" });
  }

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }

  const hashed = await bcrypt.hash(password, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });

  res.json({ success: true });
});

router.get("/auth/verify-email", async (req, res) => {
  try {
    const token = req.query.token;

    if (!token || typeof token !== "string") {
      return res.status(400).send("Invalid verification link");
    }

    const user = await prisma.user.findFirst({
      where: {
        verifyToken: token,
        verifyTokenExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      return res.status(400).send("Invalid or expired verification link");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verifyToken: null,
        verifyTokenExpiry: null,
      },
    });

    // ✅ AFTER backend success → frontend
    return res.redirect(
      "http://localhost:3000/auth?verified=true"
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Verification failed");
  }
});

router.get("/auth/me", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { 
      id: true, 
      email: true, 
      name: true, 
      image: true,
      emailVerified: true,
      githubUsername: true,
      role: true,
      bio: true,
      company: true
    },
  });

  res.json(user);
});

router.post("/auth/oauth-sync", async (req, res) => {
  try {
    const { email, name, image } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    let user = await prisma.user.findUnique({
      where: { email },
    });

    // If user does not exist → create verified OAuth user
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || "OAuth User",
          image: image || null,
          emailVerified: true, 
        },
      });
    } else {
      // Just update image if changed
      if (image && user.image !== image) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { image },
        });
      }
    }

    // Record login session
    await logSession(req, user.id);

    return res.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    console.error("OAuth Sync Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/auth/resend-verification", async (req, res) => {
  const ip = req.ip;
if (!rateLimit(`verify-${ip}`, 5, 60_000)) {
  return res.status(429).json({ error: "Too many requests" });
}

  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) {
    return res.json({ success: true });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      verifyToken: otp,
      verifyTokenExpiry: new Date(Date.now() + 1000 * 60 * 15), // 15 mins for OTP
    },
  });

  await mailService.sendOTPEmail(email, otp).catch(console.error);

  res.json({ 
    success: true,
    devOtp: process.env.NODE_ENV !== "production" ? otp : undefined
  });
});

router.post("/auth/change-password", authMiddleware, async (req, res) => {
  const schema = z.object({
    currentPassword: z.string(),
    newPassword: z
      .string()
      .min(8, "Must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a number")
      .regex(/[^A-Za-z0-9]/, "Must contain a symbol"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Weak or invalid password" });
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
  });

  if (!user || !user.password) {
    return res.status(400).json({
      error: "Password change not allowed for this account",
    });
  }

  const valid = await bcrypt.compare(
    currentPassword,
    user.password
  );

  if (!valid) {
    return res.status(400).json({
      error: "Current password is incorrect",
    });
  }

  const hashed = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed },
  });

  res.json({ success: true });
});

// Update Profile details
router.put("/user/profile", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2, "Name too short").optional(),
      role: z.string().max(50).optional().nullable(),
      bio: z.string().max(200).optional().nullable(),
      company: z.string().max(50).optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid inputs provided" });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: parsed.data,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Failed to update profile information" });
  }
});

// Update Base64 Avatar
router.post("/user/avatar", authMiddleware, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Image data is required" });
    }

    let imageUrl = image;
    
    // If it's a base64 string, upload to S3
    if (image.startsWith("data:image")) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const mimeType = image.substring(image.indexOf(":") + 1, image.indexOf(";")) || "image/png";
      const ext = mimeType.split('/')[1] || "png";

      const s3Client = new S3Client({ region: "us-east-1" });
      const key = `avatars/${req.user.id}-${Date.now()}.${ext}`;

      await s3Client.send(new PutObjectCommand({
        Bucket: "vercel-clone-ws",
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }));

      imageUrl = `https://vercel-clone-ws.s3.us-east-1.amazonaws.com/${key}`;
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { image: imageUrl },
    });

    res.json({ success: true, image: updated.image });
  } catch (err) {
    console.error("Avatar save error:", err);
    res.status(500).json({ error: "Failed to save avatar image" });
  }
});

// Connect GitHub Username
router.post("/user/connect-github", authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: "GitHub username is required" });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { githubUsername: username },
    });

    res.json({ success: true, githubUsername: updated.githubUsername });
  } catch (err) {
    console.error("GitHub connect error:", err);
    res.status(500).json({ error: "Failed to link GitHub account" });
  }
});

// Disconnect GitHub Username
router.post("/user/disconnect-github", authMiddleware, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { githubUsername: null },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("GitHub disconnect error:", err);
    res.status(500).json({ error: "Failed to unlink GitHub account" });
  }
});

module.exports = router;

// New endpoints for Session Management
router.get("/auth/sessions", authMiddleware, async (req, res) => {
  try {
    const sessions = await prisma.loginSession.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    res.json({ data: sessions });
  } catch (err) {
    console.error("Get sessions error:", err);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

router.delete("/auth/sessions/all", authMiddleware, async (req, res) => {
  try {
    await prisma.loginSession.deleteMany({
      where: { userId: req.user.id },
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete sessions error:", err);
    res.status(500).json({ error: "Failed to delete sessions" });
  }
});