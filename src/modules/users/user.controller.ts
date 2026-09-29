
import type { Request, Response } from "express";
import { userService } from "./user.service.js";

const getUser = (_req: Request, res: Response) => {
    const result = userService.getUser();

    res.status(200).json(result);
};

export const userController = {
    getUser,
};