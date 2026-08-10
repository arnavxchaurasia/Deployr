const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../lib/prisma');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireProjectAccess } = require('../services/projectAccessService');

const router = express.Router();

const CONFIG_FIELDS = [
  'buildCommand', 'outputDir', 'installCommand', 'rootDir',
  'monorepoRoot', 'framework', 'smokeTestPath', 'useDockerfile',
];

const YAML_KEY_MAP = {
  build_command:    'buildCommand',
  output_dir:       'outputDir',
  install_command:  'installCommand',
  root_dir:         'rootDir',
  monorepo_root:    'monorepoRoot',
  framework:        'framework',
  smoke_test_path:  'smokeTestPath',
  use_dockerfile:   'useDockerfile',
};

function parseYaml(yaml) {
  const result = {};
  for (const raw of yaml.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const rawKey = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    const mappedKey = YAML_KEY_MAP[rawKey];
    if (mappedKey) result[mappedKey] = value;
  }
  return result;
}

const yamlBodySchema = z.object({ yaml: z.string().min(1) });

// GET /project/:id/deploy-config  (MEMBER)
router.get('/project/:id/deploy-config', authMiddleware, requireProjectAccess('MEMBER'), async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const config = {};
    for (const f of CONFIG_FIELDS) config[f] = project[f] ?? null;
    return res.json(config);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /project/:id/deploy-config/parse  (ADMIN) — parse only, do not apply
router.post('/project/:id/deploy-config/parse', authMiddleware, requireProjectAccess('ADMIN'), async (req, res) => {
  const parsed = yamlBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const result = parseYaml(parsed.data.yaml);
  return res.json({ parsed: result, applied: false });
});

// POST /project/:id/deploy-config/apply  (ADMIN) — parse and persist
router.post('/project/:id/deploy-config/apply', authMiddleware, requireProjectAccess('ADMIN'), async (req, res) => {
  const parsed = yamlBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const updates = parseYaml(parsed.data.yaml);
    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: 'No recognized keys found in YAML' });

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: updates,
    });
    const config = {};
    for (const f of CONFIG_FIELDS) config[f] = project[f] ?? null;
    return res.json(config);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
