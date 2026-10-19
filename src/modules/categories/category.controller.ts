import type { Request, Response } from "express";
import { categoryService } from "./category.service.js";

const getCategories = async (_req: Request, res: Response) => {
    try {
        const result = await categoryService.getCategories();

        res.status(200).json(result);
    } catch (error) {
        console.error("Failed to fetch categories:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch categories",
        });
    }
};

export const categoryController = {
    getCategories,
};