import type { Request, Response } from "express";
import { productService } from "./product.service.js";

const getProducts = async (req: Request, res: Response) => {
    try {
        // Optional filter: GET /products?category=vegetables-fruits
        const category =
            typeof req.query["category"] === "string" && req.query["category"]
                ? req.query["category"]
                : undefined;

        const result = await productService.getProducts(category);

        res.status(200).json(result);
    } catch (error) {
        console.error("Failed to fetch products:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch products",
        });
    }
};

const getProductBySlug = async (req: Request, res: Response) => {
    try {
        const slug = req.params["slug"];

        if (!slug) {
            return res.status(400).json({
                success: false,
                message: "Product slug is required",
            });
        }

        const result = await productService.getProductBySlug(slug);

        return res.status(200).json(result);
    } catch (error) {
        if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        console.error("Failed to fetch product:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch product",
        });
    }
};

export const productController = {
    getProducts,
    getProductBySlug,
};