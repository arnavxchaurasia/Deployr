const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireProjectAccess } = require('../services/projectAccessService');
const { encrypt } = require('../../lib/crypto');

const router = express.Router();

const importSchema = z.object({
  content: z.string().min(1),
  environment: z.string().optional().default('production'),
  overwrite: z.boolean().optional().default(false),
});

function parseEnvContent(content) {
  const vars = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    if (!key) continue;
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars.push({ key, value });
  }
  return vars;
}

// POST /project/:id/env/import  (ADMIN)
router.post('/project/:id/env/import', authMiddleware, requireProjectAccess('ADMIN'), async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { content, environment, overwrite } = parsed.data;
  const projectId = req.params.id;
  const vars = parseEnvContent(content);

  let imported = 0;
  let skipped = 0;

  for (const { key, value } of vars) {
    const encryptedValue = encrypt(value);
    const existing = await prisma.environmentVariable.findFirst({
      where: { projectId, key, environment },
    });

    if (existing) {
      if (overwrite) {
        await prisma.environmentVariable.update({
          where: { id: existing.id },
          data: { value: encryptedValue },
        });
        imported++;
      } else {
        skipped++;
      }
    } else {
      await prisma.environmentVariable.create({
        data: { projectId, key, value: encryptedValue, environment },
      });
      imported++;
    }
  }

  return res.json({ imported, skipped });
});

module.exports = router;
