const fs = require('fs');

const path = 'src/routes/projectRoutes.js';
let content = fs.readFileSync(path, 'utf-8');

const anchor1 = `    res.json({ success: true });
  } catch (err) {
    });

    // Auto redeploy if gitURL changed`;

const replacement = `    res.json({ success: true });
  } catch (err) {
    console.error("Delete project error:", err);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

router.get("/project/:id/env", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { environmentVariables: true }
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const envs = project.environmentVariables.map(e => ({
      key: e.key,
      value: "••••••••",
      id: e.id,
      updatedAt: e.updatedAt
    }));
    res.json(envs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch env vars" });
  }
});

router.post("/project/:id/env", authMiddleware, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || typeof value !== "string") return res.status(400).json({ error: "Invalid payload" });

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const encryptedValue = encrypt(value);

    await prisma.environmentVariable.upsert({
      where: {
        projectId_key: {
          projectId: project.id,
          key: key
        }
      },
      update: { value: encryptedValue },
      create: {
        projectId: project.id,
        key: key,
        value: encryptedValue
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Env save error:", err);
    res.status(500).json({ error: "Failed to save env var" });
  }
});

router.post("/project/:id/env/bulk", authMiddleware, async (req, res) => {
  try {
    const { variables } = req.body;
    if (!Array.isArray(variables)) return res.status(400).json({ error: "variables must be an array" });

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    const upserts = variables.map((v) => {
      const encryptedValue = encrypt(v.value);
      return prisma.environmentVariable.upsert({
        where: {
          projectId_key: {
            projectId: project.id,
            key: v.key
          }
        },
        update: { value: encryptedValue },
        create: {
          projectId: project.id,
          key: v.key,
          value: encryptedValue
        }
      });
    });

    await prisma.$transaction(upserts);

    res.json({ success: true });
  } catch (err) {
    console.error("Bulk env save error:", err);
    res.status(500).json({ error: "Failed to save env vars" });
  }
});

router.delete("/project/:id/env/:key", authMiddleware, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!project) return res.status(404).json({ error: "Not found" });

    await prisma.environmentVariable.delete({
      where: {
        projectId_key: {
          projectId: project.id,
          key: req.params.key
        }
      }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete env var" });
  }
});

router.patch("/project/:id", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).optional(),
      gitURL: z.string().url().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error);

    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { environmentVariables: true }
    });

    if (!project) return res.status(404).json({ error: "Not found" });

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: parsed.data,
    });

    // Auto redeploy if gitURL changed`;

if (content.includes(anchor1)) {
  content = content.replace(anchor1, replacement);
  fs.writeFileSync(path, content);
  console.log("Successfully fixed projectRoutes.js");
} else {
  console.log("Could not find anchor block.");
}
