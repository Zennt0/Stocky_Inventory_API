import { Router } from "express";
import { chat, getHistory } from "../controller/chat.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// Require authentication for all chat routes
router.use(authenticate);

// GET /api/chat — Retrieve Chat History
router.get("/", getHistory);

// POST /api/chat — Chat endpoint
router.post("/", chat);

export default router;

