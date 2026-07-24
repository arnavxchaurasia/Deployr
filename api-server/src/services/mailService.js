const nodemailer = require("nodemailer");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  // Use real SMTP if provided in .env
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Fallback to Ethereal Email for local development
    console.log("No SMTP credentials found in .env. Falling back to Ethereal Email...");
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  return transporter;
}

// -------- HTML Email Layout Helper --------
function wrapHtml(title, preheader, content) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f9f9f9; color: #171717; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.04); border: 1px solid #eaeaea; }
        .header { padding: 32px 40px; border-bottom: 1px solid #eaeaea; text-align: center; background-color: #fafafa; }
        .logo { font-size: 24px; font-weight: 800; letter-spacing: -1px; color: #000; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
        .logo-dot { width: 12px; height: 12px; background-color: #6366f1; border-radius: 50%; display: inline-block; }
        .content { padding: 40px; }
        .preheader { display: none; max-height: 0px; overflow: hidden; }
        h1 { font-size: 24px; font-weight: 600; margin-top: 0; margin-bottom: 24px; letter-spacing: -0.5px; }
        p { font-size: 15px; line-height: 1.6; color: #525252; margin-top: 0; margin-bottom: 24px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #000; color: #fff !important; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 500; text-align: center; }
        .footer { padding: 32px 40px; background-color: #fafafa; border-top: 1px solid #eaeaea; text-align: center; }
        .footer p { font-size: 13px; color: #a3a3a3; margin: 0; }
        .footer a { color: #a3a3a3; text-decoration: underline; }
      </style>
    </head>
    <body>
      <span class="preheader">${preheader}</span>
      <div class="container">
        <div class="header">
          <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3000'}" class="logo">
            <span class="logo-dot"></span> Deployr
          </a>
        </div>
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          <p>Powered by the Edge. Sent securely from Deployr HQ.</p>
          <p><a href="#">Unsubscribe</a> &middot; <a href="#">Terms</a> &middot; <a href="#">Privacy</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// -------- Email Senders --------

async function sendEmail({ to, subject, html }) {
  const t = await getTransporter();
  const info = await t.sendMail({
    from: `"Deployr" <${process.env.SMTP_USER || 'noreply@deployr.com'}>`,
    to,
    subject,
    html,
  });

  console.log(`[Email] Sent to ${to}: ${subject}`);
  
  // If using Ethereal, print the preview URL
  if (info.messageId && nodemailer.getTestMessageUrl(info)) {
    console.log(`📧 Ethereal Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
  }
  
  return info;
}

async function sendOTPEmail(email, otp) {
  const content = `
    <h1>Verify your email address</h1>
    <p>Welcome to Deployr! We're thrilled to have you on board. Please use the verification code below to confirm your email address.</p>
    <div style="text-align: center; margin: 32px 0;">
      <div style="display: inline-block; padding: 16px 32px; background-color: #f3f4f6; color: #111827; border-radius: 8px; font-size: 32px; font-weight: 700; letter-spacing: 4px; border: 1px solid #e5e7eb;">
        ${otp}
      </div>
    </div>
    <p>This code will expire in 15 minutes.</p>
    <p>If you did not sign up for this account, you can safely ignore this email.</p>
  `;

  await sendEmail({
    to: email,
    subject: "Your Deployr Verification Code",
    html: wrapHtml("Verify Email", "Welcome to Deployr. Here is your verification code.", content),
  });
}

async function sendPasswordResetEmail(email, token) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const resetLink = `${baseUrl}/auth/reset-password?token=${token}`;

  const content = `
    <h1>Reset your password</h1>
    <p>We received a request to reset the password for your Deployr account. If you made this request, please click the button below to set a new password.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetLink}" class="button">Reset Password</a>
    </div>
    <p>This link will expire in 10 minutes.</p>
    <p>If you did not request a password reset, you can safely ignore this email. Your account remains secure.</p>
  `;

  await sendEmail({
    to: email,
    subject: "Reset your password - Deployr",
    html: wrapHtml("Reset Password", "Instructions to reset your Deployr password.", content),
  });
}

async function sendDeploymentSuccessEmail(email, projectName, deploymentId, url) {
  const safeName = escapeHtml(projectName);
  const safeId = escapeHtml(deploymentId);
  const content = `
    <h1>Deployment Successful 🎉</h1>
    <p>Great news! Your project <strong>${safeName}</strong> has been successfully built and deployed to the global edge network.</p>

    <div style="background-color: #fafafa; border: 1px solid #eaeaea; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #737373;"><strong>Deployment ID:</strong> ${safeId}</p>
      <p style="margin: 0; font-size: 14px; color: #737373;"><strong>Status:</strong> <span style="color: #10b981; font-weight: 500;">Ready</span></p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${url}" class="button">Visit Live Site</a>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: `Deployment Successful: ${safeName}`,
    html: wrapHtml("Deployment Successful", `Your project ${safeName} is now live.`, content),
  });
}

async function sendDeploymentFailureEmail(email, projectName, deploymentId, logsUrl) {
  const safeName = escapeHtml(projectName);
  const safeId = escapeHtml(deploymentId);
  const content = `
    <h1>Deployment Failed 🚨</h1>
    <p>Unfortunately, the recent build for your project <strong>${safeName}</strong> has failed during the build step.</p>

    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #991b1b;"><strong>Deployment ID:</strong> ${safeId}</p>
      <p style="margin: 0; font-size: 14px; color: #991b1b;"><strong>Status:</strong> <span style="font-weight: 500;">Failed</span></p>
    </div>

    <p>Please check the deployment logs to identify the exact error and debug the issue.</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${logsUrl}" class="button" style="background-color: #ef4444;">View Deployment Logs</a>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: `Deployment Failed: ${projectName}`,
    html: wrapHtml("Deployment Failed", `Your project ${projectName} failed to build.`, content),
  });
}

async function sendPaymentSuccessEmail(email, amount) {
  const content = `
    <h1>Payment Successful! 🎉</h1>
    <p>Thank you for upgrading to the Pro tier! We have successfully processed your payment of ₹${amount}.</p>
    
    <div style="background-color: #fafafa; border: 1px solid #eaeaea; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #737373;"><strong>Plan:</strong> Pro Tier</p>
      <p style="margin: 0; font-size: 14px; color: #737373;"><strong>Status:</strong> <span style="color: #10b981; font-weight: 500;">Active</span></p>
    </div>

    <p>Your account has been instantly upgraded. You now have access to unlimited projects, 1TB of edge bandwidth, and custom domains!</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/dashboard" class="button">Go to Dashboard</a>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: "Welcome to Pro! Payment Successful",
    html: wrapHtml("Payment Successful", "Your Deployr Pro subscription is now active.", content),
  });
}

async function sendWelcomeEmail(email, name) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const safeName = escapeHtml(name);
  const content = `
    <h1>Welcome to Deployr, ${safeName}! 🚀</h1>
    <p>Your email has been successfully verified, and your account is now fully active.</p>
    <p>Deployr is the ultimate platform for building, deploying, and scaling enterprise applications globally at the speed of thought.</p>
    
    <div style="background-color: #fafafa; border: 1px solid #eaeaea; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <h3 style="margin-top: 0; font-size: 16px; color: #111;">Next Steps</h3>
      <ol style="margin: 0; padding-left: 20px; color: #525252; font-size: 14px; line-height: 1.6;">
        <li>Connect your GitHub account</li>
        <li>Import an existing Next.js or React project</li>
        <li>Push to the <code>main</code> branch to trigger your first Edge deployment</li>
      </ol>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${baseUrl}/dashboard" class="button">Go to your Dashboard</a>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: "Welcome to Deployr! Let's get building.",
    html: wrapHtml("Welcome to Deployr", "Your account is now fully active.", content),
  });
}

async function sendInvitationEmail(email, orgName, inviteUrl) {
  const safeOrg = escapeHtml(orgName);
  const content = `
    <h1>You've been invited to join ${safeOrg}</h1>
    <p>Someone has invited you to collaborate on <strong>${safeOrg}</strong> on Deployr.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${inviteUrl}" class="button">Accept Invitation</a>
    </div>
    <p style="font-size: 13px; color: #a3a3a3;">This invitation will expire in 7 days. If you did not expect this invite, you can safely ignore this email.</p>
  `;

  await sendEmail({
    to: email,
    subject: `You've been invited to join ${orgName} on Deployr`,
    html: wrapHtml('Organization Invitation', `You have been invited to join ${orgName} on Deployr.`, content),
  });
}

module.exports = {
  sendOTPEmail,
  sendPasswordResetEmail,
  sendDeploymentSuccessEmail,
  sendDeploymentFailureEmail,
  sendPaymentSuccessEmail,
  sendWelcomeEmail,
  sendInvitationEmail,
};
