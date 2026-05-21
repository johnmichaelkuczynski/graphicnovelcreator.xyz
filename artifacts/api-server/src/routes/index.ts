import { Router, type IRouter } from "express";
import healthRouter from "./health";
import modelsRouter from "./models";
import uploadsRouter from "./uploads";
import novelsRouter from "./novels";
import screenplaysRouter from "./screenplays";
import refinementsRouter from "./refinements";
import diagnosticsRouter from "./diagnostics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(modelsRouter);
router.use(uploadsRouter);
router.use(novelsRouter);
router.use(screenplaysRouter);
router.use(refinementsRouter);
router.use(diagnosticsRouter);

export default router;
