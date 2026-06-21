require("dotenv").config();
const { sendVerificationEmail, sendDeploymentSuccessEmail } = require("./src/services/mailService");

async function run() {
  console.log("Testing verification email...");
  await sendVerificationEmail("test@example.com", "123456789");

  console.log("Testing deployment email...");
  await sendDeploymentSuccessEmail("test@example.com", "My Vercel Clone", "dep_123456", "http://my-vercel-clone.localhost:8000");
  
  console.log("Done!");
}

run().catch(console.error);
