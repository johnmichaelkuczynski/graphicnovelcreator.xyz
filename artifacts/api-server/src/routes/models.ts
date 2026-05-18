import { Router, type IRouter } from "express";
import { ListModelsResponse } from "@workspace/api-zod";
import { MODELS } from "../lib/ai";

const router: IRouter = Router();

router.get("/models", (_req, res) => {
  res.json(ListModelsResponse.parse(MODELS));
});

export default router;
