import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import routes from "./routes";
import swaggerUi from "swagger-ui-express";
import { closePool } from "./config/db";
import { swaggerSpec } from "./config/swagger";
import { errorMiddleware } from "./middleware/errorMiddleware";
import { startAbsenceWorker } from "./workers/absenceWorker";
import { startAnomalyWorker } from "./workers/anomalyWorker";
import { startEscalationWorker } from "./workers/escalationWorker";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Health check
app.get("/", (_req, res) => {
  res.send("GridWatch Backend Running — Docs at /api-docs");
});

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Serve raw OpenAPI JSON (useful for importing into Postman)
app.get("/api-docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// API routes
app.use("/api", routes);

// Central error handler (must be after routes)
app.use(errorMiddleware);

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] Swagger UI at http://localhost:${PORT}/api-docs`);

  // Start background workers
  const w1 = startAnomalyWorker();
  const w2 = startAbsenceWorker();
  const w3 = startEscalationWorker();

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[Server] Shutting down...");
    clearInterval(w1);
    clearInterval(w2);
    clearInterval(w3);
    server.close();
    await closePool();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
});