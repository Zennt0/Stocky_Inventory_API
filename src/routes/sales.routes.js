import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import {
  createSale,
  getSales,
  getSalesStats,
  getSale,
} from "../controller/sales.controller.js";
import {
  validate,
  createSaleSchema,
  saleIdParam,
  salesQuerySchema,
} from "../middleware/validation.js";

const router = Router();

// All sales routes require authentication
router.use(authenticate);

router.post("/", validate(createSaleSchema), createSale);
router.get("/", validate(salesQuerySchema), getSales);
router.get("/stats", getSalesStats);
router.get("/:id", validate(saleIdParam), getSale);

export default router;
