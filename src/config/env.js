/**
 * Environment Configuration — Fail-Fast Startup
 *
 * Validates that all required environment variables are present at startup.
 * If any are missing, the server crashes immediately with a clear error
 * instead of failing later during user actions.
 *
 * Based on .env.example — we never read or modify the active .env directly.
 */

const REQUIRED_VARS = [
  "DATABASE_URL",
  "JWT_SECRET",
  "GEMINI_API_KEY",
];

const OPTIONAL_VARS = [
  { key: "NODE_ENV", default: "development" },
  { key: "PORT", default: "3000" },
  { key: "JWT_EXPIRES_IN", default: "7d" },
  { key: "JWT_REFRESH_EXPIRES_IN", default: "30d" },
  { key: "FRONTEND_URL", default: null },
  { key: "SMTP_HOST", default: "smtp.gmail.com" },
  { key: "SMTP_PORT", default: "587" },
  { key: "SMTP_SECURE", default: "false" },
  { key: "SMTP_USER", default: null },
  { key: "SMTP_PASS", default: null },
  { key: "EMAIL_FROM", default: null },
];

// ── Validate required variables ──
const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error("\n❌ FATAL: Missing required environment variables:");
  missing.forEach((key) => console.error(`   • ${key}`));
  console.error("\nPlease set them in your .env file (see .env.example for reference).\n");
  process.exit(1);
}

// ── Warn about placeholder values ──
if (process.env.JWT_SECRET === "your_super_secret_jwt_key_here_change_this") {
  console.warn("⚠️  WARNING: JWT_SECRET is using the default placeholder. Change it for production!");
}

if (process.env.GEMINI_API_KEY === "SAMPLE") {
  console.warn("⚠️  WARNING: GEMINI_API_KEY is set to 'SAMPLE'. AI features will not work.");
}

// ── Export validated config object ──
const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "3000", 10),
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  FRONTEND_URL: process.env.FRONTEND_URL || null,
  SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_SECURE: process.env.SMTP_SECURE === "true",
  SMTP_USER: process.env.SMTP_USER || null,
  SMTP_PASS: process.env.SMTP_PASS || null,
  EMAIL_FROM: process.env.EMAIL_FROM || null,
};

console.log("✅ Environment variables validated successfully.");

export default env;
