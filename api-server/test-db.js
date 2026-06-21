const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log("USERS:", users.map(u => ({ id: u.id, email: u.email, emailVerified: u.emailVerified })));
  
  const projects = await prisma.project.findMany();
  console.log("PROJECTS:", projects.map(p => ({ id: p.id, name: p.name, userId: p.userId, subDomain: p.subDomain })));
}

main().finally(() => prisma.$disconnect());
