const { prisma } = require('./lib/prisma');

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, emailVerified: true }
  });
  console.log("Current users in database:", users);
  
  if (users.length > 0) {
    const emailToUnverify = process.argv[2];
    if (emailToUnverify) {
      await prisma.user.update({
        where: { email: emailToUnverify },
        data: { emailVerified: false, verifyToken: null, verifyTokenExpiry: null }
      });
      console.log(`Successfully set emailVerified: false for ${emailToUnverify}`);
    } else {
      for (const u of users) {
        await prisma.user.update({
          where: { id: u.id },
          data: { emailVerified: false, verifyToken: null, verifyTokenExpiry: null }
        });
      }
      console.log("Successfully set emailVerified: false for ALL users in the database.");
    }
  } else {
    console.log("No users found.");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
