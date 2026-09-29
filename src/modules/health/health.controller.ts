import type { Request, Response } from "express";
import { healthService } from "./health.service.js";

const getHealth = (_req: Request, res: Response) => {
    const result = healthService.getHealth();

    res.status(200).json(result);
};

export const healthController = {
    getHealth,
};