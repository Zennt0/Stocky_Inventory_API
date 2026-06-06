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

const router = Router();

// All product routes require authentication
router.use(authenticate);

// Read routes (any authenticated user)
router.get("/", getProducts);
router.get("/low-stock", getLowStock);
router.get("/stats", getStats);
router.get("/imei/:imei", getByImei);
router.get("/lookup-specs/:imei", aiLookupLimiter, lookupSpecs);
router.get("/:id", getProduct);

// Write routes (Admin & Staff only)
router.post("/", authorize("ADMIN", "STAFF"), createProduct);
router.put("/:id", authorize("ADMIN", "STAFF"), updateProduct);

// Delete (Admin only)
router.delete("/:id", authorize("ADMIN"), deleteProduct);

export default router;
