import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import {
  register,
  login,
  getMe,
  refresh,
  logout,
  verifyEmail,
  resendVerification,
  forgotPassword,
  verifyResetCode,
  resetPassword,
} from "../controller/auth.controller.js";
import {
  validate,
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  verifyResetCodeSchema,
  resetPasswordSchema,
  refreshSchema,
} from "../middleware/validation.js";

const router = Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/verify-email", validate(verifyEmailSchema), verifyEmail);
router.post("/resend-verification", validate(resendVerificationSchema), resendVerification);
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post("/verify-reset-code", validate(verifyResetCodeSchema), verifyResetCode);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);
router.post("/refresh", validate(refreshSchema), refresh);
router.post("/logout", logout);
router.get("/me", authenticate, getMe);

export default router;
