import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { connect, disconnect } from "./src/config/db.js";
import { errorHandler } from "./src/middleware/errorHandler.js";

// Routes
import authRoutes from "./src/routes/auth.routes.js";
import productRoutes from "./src/routes/product.routes.js";
import salesRoutes from "./src/routes/sales.routes.js";
import chatRoutes from "./src/routes/chat.routes.js";

dotenv.config();
await connect();

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API Routes ──
app.get("/", (req, res) => {
  res.json({
    message: "📱 Inventory System API",
    version: "1.0.0",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/chat", chatRoutes);

// ── Error Handler (must be last) ──
app.use(errorHandler);

// ── Start Server ──
const server = app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`),
);

// ── Graceful Shutdown ──
process.on("SIGINT", async () => {
  await disconnect();
  server.close(() => process.exit(0));
});
