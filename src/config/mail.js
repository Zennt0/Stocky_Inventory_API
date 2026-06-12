import nodemailer from "nodemailer";
import logger from "./logger.js";

// ── Nodemailer Transporter ──
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send a verification email with a 6-digit code.
 * @param {string} email     - Recipient email address
 * @param {string} firstName - Recipient first name
 * @param {string} code      - 6-digit verification code
 */
export async function sendVerificationEmail(email, firstName, code) {
  const from = process.env.EMAIL_FROM || '"Stocky Support" <noreply@stocky.app>';

  const html = `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f1117; border-radius: 16px; overflow: hidden; border: 1px solid #2a2d35;">
    <div style="background: linear-gradient(135deg, #1a9a8a, #14b8a6); padding: 32px 24px; text-align: center;">
      <h1 style="margin: 0; color: #fff; font-size: 28px; font-weight: 700;">📱 Stocky</h1>
      <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">AI-Powered Inventory System</p>
    </div>
    <div style="padding: 32px 24px; color: #e4e4e7;">
      <p style="margin: 0 0 16px; font-size: 16px;">Hello <strong>${firstName}</strong>,</p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #a1a1aa; line-height: 1.6;">
        Welcome to Stocky! Please use the verification code below to confirm your email address. This code expires in <strong>15 minutes</strong>.
      </p>
      <div style="background: #1c1f26; border: 1px solid #2a2d35; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #14b8a6;">${code}</span>
      </div>
      <p style="margin: 0; font-size: 13px; color: #71717a; line-height: 1.5;">
        If you didn't create an account with Stocky, you can safely ignore this email.
      </p>
    </div>
    <div style="background: #1c1f26; padding: 16px 24px; text-align: center; border-top: 1px solid #2a2d35;">
      <p style="margin: 0; font-size: 12px; color: #52525b;">© ${new Date().getFullYear()} Stocky. All rights reserved.</p>
    </div>
  </div>
  `;

  await transporter.sendMail({
    from,
    to: email,
    subject: `🔐 Stocky — Your Verification Code: ${code}`,
    html,
  });

  logger.info({ email }, "[Mail] Verification email sent");
}

/**
 * Send a password reset email with a 6-digit code.
 * @param {string} email     - Recipient email address
 * @param {string} firstName - Recipient first name
 * @param {string} code      - 6-digit reset code
 */
export async function sendPasswordResetEmail(email, firstName, code) {
  const from = process.env.EMAIL_FROM || '"Stocky Support" <noreply@stocky.app>';

  const html = `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f1117; border-radius: 16px; overflow: hidden; border: 1px solid #2a2d35;">
    <div style="background: linear-gradient(135deg, #f43f5e, #e11d48); padding: 32px 24px; text-align: center;">
      <h1 style="margin: 0; color: #fff; font-size: 28px; font-weight: 700;">🔐 Stocky</h1>
      <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Password Reset Request</p>
    </div>
    <div style="padding: 32px 24px; color: #e4e4e7;">
      <p style="margin: 0 0 16px; font-size: 16px;">Hello <strong>${firstName}</strong>,</p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #a1a1aa; line-height: 1.6;">
        We received a request to reset your password. Please use the verification code below to complete the reset. This code expires in <strong>10 minutes</strong>.
      </p>
      <div style="background: #1c1f26; border: 1px solid #2a2d35; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #f43f5e;">${code}</span>
      </div>
      <p style="margin: 0; font-size: 13px; color: #71717a; line-height: 1.5;">
        If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
      </p>
    </div>
    <div style="background: #1c1f26; padding: 16px 24px; text-align: center; border-top: 1px solid #2a2d35;">
      <p style="margin: 0; font-size: 12px; color: #52525b;">© ${new Date().getFullYear()} Stocky. All rights reserved.</p>
    </div>
  </div>
  `;

  await transporter.sendMail({
    from,
    to: email,
    subject: `🔑 Stocky — Password Reset Verification Code: ${code}`,
    html,
  });

  logger.info({ email }, "[Mail] Password reset email sent");
}

export default transporter;
