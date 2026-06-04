import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import {
  createSale,
  getSales,
  getSalesStats,
  getSale,
} from "../controller/sales.controller.js";

const router = Router();

// All sales routes require authentication
router.use(authenticate);

router.post("/", createSale);
router.get("/", getSales);
router.get("/stats", getSalesStats);
router.get("/:id", getSale);

export default router;
