import { Router, type IRouter } from "express";
import healthRouter from "./health";
import billRouter from "./bill";

const router: IRouter = Router();

router.use(healthRouter);
router.use(billRouter);

export default router;
