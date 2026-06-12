import { ZodError } from "zod";
import logger from "../config/logger.js";

/**
 * Global Error Handler Middleware
 * Catches all unhandled errors and returns consistent JSON responses
 */
export function errorHandler(err, req, res, next) {
  // ── Zod Validation Errors ──
  if (err instanceof ZodError) {
    const details = {};
    err.errors.forEach((e) => {
      const field = e.path.join(".") || "input";
      details[field] = e.message;
    });
    logger.warn({ details }, "Validation Error");
    return res.status(400).json({
      error: "Validation failed.",
      details,
    });
  }

  logger.error({ err }, `Error: ${err.message}`);

  // Prisma errors
  if (err.code === "P2002") {
    const field = err.meta?.target?.[0] || "field";
    return res.status(409).json({
      error: `A record with this ${field} already exists.`,
    });
  }

  if (err.code === "P2025") {
    return res.status(404).json({
      error: "Record not found.",
    });
  }

  // Validation errors
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: err.message,
    });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ error: "Invalid token." });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ error: "Token expired." });
  }

  // Default server error
  res.status(err.status || 500).json({
    error: err.message || "Internal server error.",
  });
}
