import * as authService from "../services/auth.service.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../config/mail.js";
import logger from "../config/logger.js";

// ──────────────────────────────────────────
// Password Strength Validator
// ──────────────────────────────────────────
const PASSWORD_RULES = [
  { regex: /.{8,}/, message: "at least 8 characters" },
  { regex: /[A-Z]/, message: "at least 1 uppercase letter" },
  { regex: /[a-z]/, message: "at least 1 lowercase letter" },
  { regex: /[0-9]/, message: "at least 1 number" },
  { regex: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/, message: "at least 1 special character (!@#$%^&*...)" },
];

function validatePasswordStrength(password) {
  const failures = PASSWORD_RULES.filter((rule) => !rule.regex.test(password));
  if (failures.length > 0) {
    return `Password must contain: ${failures.map((f) => f.message).join(", ")}.`;
  }
  return null;
}

// ── Constants ──
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const VERIFICATION_CODE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

// ──────────────────────────────────────────
// POST /api/auth/register
// ──────────────────────────────────────────
export async function register(req, res, next) {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password) {
      return res
        .status(400)
        .json({ error: "First name, last name, email, and password are required." });
    }

    // Validate password strength
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already exists
    const existing = await authService.findUserByEmail(normalizedEmail);
    if (existing) {
      // If user exists but is NOT verified and token expired, allow re-registration
      if (!existing.emailVerified) {
        const isExpired =
          !existing.verificationTokenExpires ||
          new Date() > new Date(existing.verificationTokenExpires);

        if (isExpired) {
          // Delete unverified user so they can re-register
          await authService.deleteUser(existing.id);
        } else {
          return res.status(409).json({
            error: "An account with this email is pending verification. Please check your email or resend the code.",
            requiresVerification: true,
            email: normalizedEmail,
          });
        }
      } else {
        return res
          .status(409)
          .json({ error: "An account with this email already exists." });
      }
    }

    // Hash password
    const hashedPassword = await authService.hashPassword(password);

    // Generate verification code
    const verificationCode = authService.generateVerificationCode();
    const verificationExpires = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MS);

    // Create user (unverified)
    const user = await authService.createUser({
      firstName,
      lastName,
      email: normalizedEmail,
      password: hashedPassword,
      role: role === "ADMIN" ? "ADMIN" : "STAFF",
      emailVerified: false,
      verificationToken: verificationCode,
      verificationTokenExpires: verificationExpires,
    });

    // Send verification email (fire & forget with error logging)
    sendVerificationEmail(normalizedEmail, firstName, verificationCode).catch((err) => {
      logger.error({ err }, "Failed to send verification email");
    });

    // Respond WITHOUT tokens — user must verify first
    res.status(201).json({
      message: "Account created! Please check your email for a verification code.",
      requiresVerification: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// POST /api/auth/verify-email
// ──────────────────────────────────────────
export async function verifyEmail(req, res, next) {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email and verification code are required." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await authService.findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(404).json({ error: "No account found with this email." });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: "This email is already verified. You can log in." });
    }

    // Check code match
    if (user.verificationToken !== code.trim()) {
      return res.status(400).json({ error: "Invalid verification code." });
    }

    // Check expiry
    if (!user.verificationTokenExpires || new Date() > new Date(user.verificationTokenExpires)) {
      return res.status(400).json({
        error: "Verification code has expired. Please request a new one.",
        codeExpired: true,
      });
    }

    // Mark as verified, clear tokens
    await authService.updateUser(user.id, {
      emailVerified: true,
      verificationToken: null,
      verificationTokenExpires: null,
    });

    // Generate JWT tokens now
    const tokenPayload = { id: user.id, email: user.email, role: user.role };
    const token = authService.signAccessToken(tokenPayload);
    const refreshToken = authService.signRefreshToken(tokenPayload);

    await authService.updateUser(user.id, {
      refreshToken: authService.hashToken(refreshToken),
    });

    res.json({
      message: "Email verified successfully!",
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
      token,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// POST /api/auth/resend-verification
// ──────────────────────────────────────────
export async function resendVerification(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await authService.findUserByEmail(normalizedEmail);
    if (!user) {
      // Don't reveal if account exists
      return res.json({ message: "If an account exists, a new verification code has been sent." });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: "This email is already verified." });
    }

    // Generate new code
    const verificationCode = authService.generateVerificationCode();
    const verificationExpires = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MS);

    await authService.updateUser(user.id, {
      verificationToken: verificationCode,
      verificationTokenExpires: verificationExpires,
    });

    sendVerificationEmail(normalizedEmail, user.firstName, verificationCode).catch((err) => {
      logger.error({ err }, "Failed to resend verification email");
    });

    res.json({ message: "A new verification code has been sent to your email." });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// POST /api/auth/login
// ──────────────────────────────────────────
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user by email
    const user = await authService.findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Check account lockout
    if (user.lockoutUntil && new Date() < new Date(user.lockoutUntil)) {
      const remainingMs = new Date(user.lockoutUntil) - new Date();
      const remainingMin = Math.ceil(remainingMs / 60000);
      return res.status(423).json({
        error: `Account is temporarily locked due to too many failed login attempts. Try again in ${remainingMin} minute(s).`,
        lockedUntil: user.lockoutUntil,
      });
    }

    // Verify password
    const isValid = await authService.comparePassword(password, user.password);
    if (!isValid) {
      // Increment failed attempts
      const newAttempts = user.failedLoginAttempts + 1;
      const updateData = { failedLoginAttempts: newAttempts };

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        updateData.lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        await authService.updateUser(user.id, updateData);
        return res.status(423).json({
          error: `Too many failed login attempts. Your account has been locked for 15 minutes.`,
          lockedUntil: updateData.lockoutUntil,
        });
      }

      await authService.updateUser(user.id, updateData);

      const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
      return res.status(401).json({
        error: `Invalid email or password. ${remaining} attempt(s) remaining before lockout.`,
      });
    }

    // Check email verification
    if (!user.emailVerified) {
      return res.status(403).json({
        error: "Please verify your email before logging in.",
        requiresVerification: true,
        email: user.email,
      });
    }

    // Reset failed attempts on successful login
    const tokenPayload = { id: user.id, email: user.email, role: user.role };
    const token = authService.signAccessToken(tokenPayload);
    const refreshToken = authService.signRefreshToken(tokenPayload);

    await authService.updateUser(user.id, {
      refreshToken: authService.hashToken(refreshToken),
      failedLoginAttempts: 0,
      lockoutUntil: null,
    });

    res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
      token,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// GET /api/auth/me
// ──────────────────────────────────────────
export async function getMe(req, res, next) {
  try {
    const user = await authService.findUserById(req.user.id, {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      createdAt: true,
    });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// POST /api/auth/refresh — Token Rotation
// ──────────────────────────────────────────
export async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required." });
    }

    let decoded;
    try {
      decoded = authService.verifyToken(refreshToken);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired refresh token." });
    }

    const user = await authService.findUserById(decoded.id);
    if (!user || user.refreshToken !== authService.hashToken(refreshToken)) {
      return res.status(401).json({ error: "Refresh token is not active or invalid." });
    }

    // Generate new access token
    const tokenPayload = { id: user.id, email: user.email, role: user.role };
    const token = authService.signAccessToken(tokenPayload);

    // Generate new refresh token for rotation (RTR)
    const newRefreshToken = authService.signRefreshToken(tokenPayload);

    await authService.updateUser(user.id, {
      refreshToken: authService.hashToken(newRefreshToken),
    });

    res.json({ token, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// POST /api/auth/logout — Clear Session
// ──────────────────────────────────────────
export async function logout(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const { refreshToken } = req.body || {};
    let userId = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = authService.verifyToken(token, { ignoreExpiration: true });
        userId = decoded.id;
      } catch (_) {}
    }

    if (!userId && refreshToken) {
      try {
        const decoded = authService.verifyToken(refreshToken);
        userId = decoded.id;
      } catch (_) {}
    }

    if (userId) {
      await authService.updateUser(userId, { refreshToken: null });
    }

    res.json({ message: "Logged out successfully." });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// POST /api/auth/forgot-password
// ──────────────────────────────────────────
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const user = await authService.findUserByEmail(email.trim().toLowerCase());
    
    // To prevent email enumeration, return a generic success message even if user doesn't exist
    if (!user) {
      return res.json({ message: "If the email is registered, a password reset code has been sent." });
    }

    // Generate random 6-digit numeric verification code
    const resetCode = authService.generateVerificationCode();
    // 10 minutes expiry time
    const resetExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Save in user document
    await authService.updateUser(user.id, {
      resetPasswordToken: resetCode,
      resetPasswordExpires: resetExpires,
    });

    // Send code to email
    try {
      await sendPasswordResetEmail(user.email, user.firstName, resetCode);
      res.json({ message: "If the email is registered, a password reset code has been sent." });
    } catch (mailErr) {
      logger.error({ err: mailErr }, "Forgot password email sending failed");
      return res.status(500).json({ error: "Failed to send verification email. Please try again." });
    }
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// POST /api/auth/verify-reset-code
// ──────────────────────────────────────────
export async function verifyResetCode(req, res, next) {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email and verification code are required." });
    }

    const user = await authService.findUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (!user.resetPasswordToken || user.resetPasswordToken !== code.trim()) {
      return res.status(400).json({ error: "Invalid verification code." });
    }

    if (!user.resetPasswordExpires || new Date() > new Date(user.resetPasswordExpires)) {
      return res.status(410).json({ error: "Verification code has expired. Please request a new one." });
    }

    res.json({ message: "Code verified successfully. You may now reset your password." });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// POST /api/auth/reset-password
// ──────────────────────────────────────────
export async function resetPassword(req, res, next) {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "Email, verification code, and new password are required." });
    }

    const user = await authService.findUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Double check token validity and expiration
    if (!user.resetPasswordToken || user.resetPasswordToken !== code.trim()) {
      return res.status(400).json({ error: "Invalid verification code." });
    }

    if (!user.resetPasswordExpires || new Date() > new Date(user.resetPasswordExpires)) {
      return res.status(410).json({ error: "Verification code has expired. Please request a new one." });
    }

    // Validate strength of new password
    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      return res.status(400).json({ error: strengthError });
    }

    // Hash the password
    let hashedPassword;
    try {
      hashedPassword = await authService.hashPassword(newPassword);
    } catch (hashErr) {
      logger.error({ err: hashErr }, "Password hashing failed during reset");
      return res.status(500).json({ error: "Password update failure. Please try again." });
    }

    // Update the password, reset lockout/attempts, and clear reset token & expiration fields
    await authService.updateUser(user.id, {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
      failedLoginAttempts: 0,
      lockoutUntil: null,
    });

    res.json({ message: "Your password has been successfully reset. You can now log in." });
  } catch (err) {
    next(err);
  }
}
