import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", router);

const candidatePaths = [
  path.resolve(process.cwd(), "artifacts/graphic-novel/dist/public"),
  path.resolve(process.cwd(), "../graphic-novel/dist/public"),
  typeof __dirname !== "undefined"
    ? path.resolve(__dirname, "../../graphic-novel/dist/public")
    : null,
  typeof __dirname !== "undefined"
    ? path.resolve(__dirname, "../graphic-novel/dist/public")
    : null,
].filter((p): p is string => p !== null);

const frontendDist = candidatePaths.find((p) => fs.existsSync(p));

if (frontendDist) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  logger.info({ frontendDist }, "Serving frontend from dist");
} else {
  logger.warn({ candidatePaths }, "Frontend dist not found; root URL will 404");
}

export default app;
