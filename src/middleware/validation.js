import { z } from "zod";

// ──────────────────────────────────────────
// Generic Validation Middleware Factory
// ──────────────────────────────────────────

/**
 * Creates an Express middleware that validates req.body, req.query, or req.params
 * against a Zod schema. On failure, passes a ZodError to next().
 *
 * @param {{ body?: z.ZodType, query?: z.ZodType, params?: z.ZodType }} schemas
 */
export function validate(schemas) {
  return (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        Object.defineProperty(req, "query", {
          value: parsed,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ──────────────────────────────────────────
// Reusable Primitives
// ──────────────────────────────────────────

const emailField = z
  .string({ required_error: "Email is required." })
  .trim()
  .toLowerCase()
  .email("Invalid email address.");

const passwordField = z
  .string({ required_error: "Password is required." })
  .min(8, "Password must be at least 8 characters.");

const positiveInt = z.coerce.number().int().positive();

const positiveDecimal = z.coerce.number().positive("Must be a positive number.");

const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).passthrough();

// ──────────────────────────────────────────
// Auth Schemas
// ──────────────────────────────────────────

export const registerSchema = {
  body: z.object({
    firstName: z.string({ required_error: "First name is required." }).trim().min(1, "First name is required."),
    lastName: z.string({ required_error: "Last name is required." }).trim().min(1, "Last name is required."),
    email: emailField,
    password: passwordField,
    role: z.enum(["ADMIN", "STAFF"]).optional().default("ADMIN"),
  }),
};

export const loginSchema = {
  body: z.object({
    email: emailField,
    password: z.string({ required_error: "Password is required." }).min(1, "Password is required."),
  }),
};

export const verifyEmailSchema = {
  body: z.object({
    email: emailField,
    code: z.string({ required_error: "Verification code is required." }).trim().min(1, "Verification code is required."),
  }),
};

export const resendVerificationSchema = {
  body: z.object({
    email: emailField,
  }),
};

export const forgotPasswordSchema = {
  body: z.object({
    email: emailField,
  }),
};

export const verifyResetCodeSchema = {
  body: z.object({
    email: emailField,
    code: z.string({ required_error: "Verification code is required." }).trim().min(1, "Verification code is required."),
  }),
};

export const resetPasswordSchema = {
  body: z.object({
    email: emailField,
    code: z.string({ required_error: "Verification code is required." }).trim().min(1, "Verification code is required."),
    newPassword: passwordField,
  }),
};

export const refreshSchema = {
  body: z.object({
    refreshToken: z.string({ required_error: "Refresh token is required." }).min(1, "Refresh token is required."),
  }),
};

// ──────────────────────────────────────────
// Product Schemas
// ──────────────────────────────────────────

export const createProductSchema = {
  body: z.object({
    brand: z.string({ required_error: "Brand is required." }).trim().min(1, "Brand is required."),
    model: z.string({ required_error: "Model is required." }).trim().min(1, "Model is required."),
    variant: z.string().trim().optional().nullable(),
    storage: z.string().trim().optional().nullable(),
    ram: z.string().trim().optional().nullable(),
    color: z.string().trim().optional().nullable(),
    imei: z.string().trim().optional().nullable(),
    supplier: z.string().trim().optional().nullable(),
    purchasePrice: positiveDecimal,
    sellingPrice: positiveDecimal,
    quantity: z.coerce.number().int().min(0).default(0),
    imageUrl: z.string().url().optional().nullable(),
  }),
};

export const updateProductSchema = {
  body: z.object({
    brand: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    variant: z.string().trim().optional().nullable(),
    storage: z.string().trim().optional().nullable(),
    ram: z.string().trim().optional().nullable(),
    color: z.string().trim().optional().nullable(),
    imei: z.string().trim().optional().nullable(),
    supplier: z.string().trim().optional().nullable(),
    purchasePrice: positiveDecimal.optional(),
    sellingPrice: positiveDecimal.optional(),
    quantity: z.coerce.number().int().min(0).optional(),
    imageUrl: z.string().url().optional().nullable(),
  }),
  params: z.object({
    id: z.coerce.number().int().positive("Invalid product ID."),
  }),
};

export const productIdParam = {
  params: z.object({
    id: z.coerce.number().int().positive("Invalid product ID."),
  }),
};

export const productImeiParam = {
  params: z.object({
    imei: z.string().length(15, "A valid 15-digit IMEI is required."),
  }),
};

export const productQuerySchema = {
  query: z.object({
    search: z.string().optional(),
    brand: z.string().optional(),
    status: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sort: z.enum(["createdAt", "brand", "model", "sellingPrice", "quantity"]).default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
  }).passthrough(),
};

// ──────────────────────────────────────────
// Sale Schemas
// ──────────────────────────────────────────

export const createSaleSchema = {
  body: z.object({
    productId: positiveInt,
    soldPrice: positiveDecimal,
    customerName: z.string().trim().optional().nullable(),
  }),
};

export const saleIdParam = {
  params: z.object({
    id: z.coerce.number().int().positive("Invalid sale ID."),
  }),
};

export const salesQuerySchema = {
  query: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    period: z.enum(["today", "week", "month"]).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }).passthrough(),
};

// ──────────────────────────────────────────
// Chat Schemas
// ──────────────────────────────────────────

export const chatSchema = {
  body: z.object({
    message: z.string({ required_error: "Message is required." }).trim().min(1, "Message is required."),
  }),
};
