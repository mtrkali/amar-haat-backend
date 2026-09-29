import express from "express";
import { healthController } from "./health.controller.js";

const router = express.Router();

router.get("/", healthController.getHealth);

export const healthRoute = router;