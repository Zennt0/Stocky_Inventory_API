import rateLimit from "express-rate-limit";

/**
 * Auth rate limiter — Prevents brute-force login/register attacks.
 * 10 requests per 15 minutes per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

/**
 * AI lookup limiter — Matches Gemini free tier (5 RPM / 20 RPD).
 * 5 requests per minute per IP.
 */
export const aiLookupLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI lookup requests. Please wait a minute." },
});

/**
 * General API limiter — Prevents overall abuse.
 * 100 requests per 15 minutes per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});
