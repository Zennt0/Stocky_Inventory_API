import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { aiLookupLimiter } from "../middleware/rateLimit.js";
import {
  getProducts,
  getLowStock,
  getStats,
  getByImei,
  lookupSpecs,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controller/product.controller.js";
import {
  validate,
  createProductSchema,
  updateProductSchema,
  productIdParam,
  productImeiParam,
  productQuerySchema,
} from "../middleware/validation.js";

const router = Router();

// All product routes require authentication
router.use(authenticate);

// Read routes (any authenticated user)
router.get("/", validate(productQuerySchema), getProducts);
router.get("/low-stock", getLowStock);
router.get("/stats", getStats);
router.get("/imei/:imei", validate(productImeiParam), getByImei);
router.get("/lookup-specs/:imei", aiLookupLimiter, validate(productImeiParam), lookupSpecs);
router.get("/:id", validate(productIdParam), getProduct);

// Write routes (Admin & Staff only)
router.post("/", authorize("ADMIN", "STAFF"), validate(createProductSchema), createProduct);
router.put("/:id", authorize("ADMIN", "STAFF"), validate(updateProductSchema), updateProduct);

// Delete (Admin only)
router.delete("/:id", authorize("ADMIN"), validate(productIdParam), deleteProduct);

export default router;
