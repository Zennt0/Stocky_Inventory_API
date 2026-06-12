import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

/**
 * Auth Service — Database and token operations for authentication.
 * Controllers delegate all Prisma calls and token logic here.
 */

// ── Constants ──
const SALT_ROUNDS = 12;

/** Hash a plain-text password */
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Compare a plain-text password against a hash */
export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/** Hash a token with SHA-256 for secure storage */
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Generate a 6-digit numeric verification code */
export function generateVerificationCode() {
  return crypto.randomInt(100000, 999999).toString();
}

/** Sign a short-lived access JWT */
export function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "15m" });
}

/** Sign a long-lived refresh JWT */
export function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
}

/** Verify a JWT (throws on failure) */
export function verifyToken(token, options = {}) {
  return jwt.verify(token, process.env.JWT_SECRET, options);
}

// ──────────────────────────────────────────
// User CRUD
// ──────────────────────────────────────────

/** Find a user by email */
export async function findUserByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

/** Find a user by ID */
export async function findUserById(id, select = undefined) {
  return prisma.user.findUnique({ where: { id }, ...(select ? { select } : {}) });
}

/** Create a new (unverified) user */
export async function createUser(data) {
  return prisma.user.create({
    data,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });
}

/** Delete a user by ID */
export async function deleteUser(id) {
  return prisma.user.delete({ where: { id } });
}

/** Update a user by ID */
export async function updateUser(id, data) {
  return prisma.user.update({ where: { id }, data });
}
