import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { connect, disconnect } from "./src/config/db.js";
import { errorHandler } from "./src/middleware/errorHandler.js";
import { apiLimiter, authLimiter } from "./src/middleware/rateLimit.js";
import logger from "./src/config/logger.js";

// Routes
import authRoutes from "./src/routes/auth.routes.js";
import productRoutes from "./src/routes/product.routes.js";
import salesRoutes from "./src/routes/sales.routes.js";
import chatRoutes from "./src/routes/chat.routes.js";

dotenv.config();

// Validate environment variables immediately after dotenv loads
import "./src/config/env.js";

await connect();

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security Middleware ──
app.use(helmet());

// ── CORS — Restrict to allowed origins ──
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  process.env.FRONTEND_URL, // Set in .env for production
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin) return callback(null, true);

      // Allow any localhost/127.0.0.1 origin with any port (for Flutter Web debug/dev sessions)
      if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ── Body Parsers ──
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Global Rate Limit ──
app.use("/api/", apiLimiter);

// ── API Routes ──
app.get("/", (req, res) => {
  res.json({
    message: "📱 Stocky API",
    version: "1.0.0",
  });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/chat", chatRoutes);

// ── Error Handler (must be last) ──
app.use(errorHandler);

// ── Start Server ──
const server = app.listen(PORT, () =>
  logger.info(`Server running on http://localhost:${PORT}`),
);

// ── Graceful Shutdown (handles both local Ctrl+C and Render deploys) ──
const shutdown = async () => {
  logger.info("Shutting down gracefully...");
  await disconnect();
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
