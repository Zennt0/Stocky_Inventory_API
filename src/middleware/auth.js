import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

/**
 * JWT Authentication Middleware
 * Verifies the Bearer token and attaches user to req.user
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

/**
 * Role-based Authorization Middleware
 * Usage: authorize("ADMIN") or authorize("ADMIN", "STAFF")
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: "You don't have permission for this action." });
    }

    next();
  };
}
