import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { register, login, getMe, refresh, logout } from "../controller/auth.controller.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/me", authenticate, getMe);

export default router;
