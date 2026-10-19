import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";
import { productService, ProductError } from "./product.service.js";
import type { Actor } from "./product.service.js";
import { validateProductBody } from "./product.validation.js";

const sendProductError = (error: unknown, res: Response, fallback: string) => {
    if (error instanceof ProductError) {
        const status =
            error.code === "PRODUCT_NOT_FOUND" ? 404
                : error.code === "SLUG_TAKEN" ? 409
                    : error.code === "FORBIDDEN" || error.code === "SELLER_NOT_APPROVED" ? 403
                        : 400; // CATEGORY_NOT_FOUND, SELLER_NOT_FOUND

        return res.status(status).json({
            success: false,
            code: error.code,
            message: error.message,
        });
    }

    console.error(fallback, error);

    return res.status(500).json({ success: false, message: fallback });
};

const getActor = (req: AuthenticatedRequest): Actor | null =>
    typeof req.userId === "number" && typeof req.userRole === "string"
        ? { userId: req.userId, role: req.userRole }
        : null;

// ---------- Public ----------

const getProducts = async (req: Request, res: Response) => {
    try {
        // Optional filter: GET /products?category=vegetables-fruits
        const category =
            typeof req.query["category"] === "string" && req.query["category"]
                ? req.query["category"]
                : undefined;

        return res.status(200).json(await productService.getProducts(category));
    } catch (error) {
        return sendProductError(error, res, "Failed to fetch products");
    }
};

const getProductBySlug = async (req: Request, res: Response) => {
    const slug = req.params["slug"];

    if (!slug) {
        return res.status(400).json({
            success: false,
            message: "Product slug is required",
        });
    }

    try {
        return res.status(200).json(await productService.getProductBySlug(slug));
    } catch (error) {
        return sendProductError(error, res, "Failed to fetch product");
    }
};

// ---------- Admin and seller ----------

const listForManagement = async (req: AuthenticatedRequest, res: Response) => {
    const actor = getActor(req);

    if (!actor) {
        return res.status(401).json({ success: false, message: "Authentication required" });
    }

    try {
        return res.status(200).json(await productService.listForManagement(actor));
    } catch (error) {
        return sendProductError(error, res, "Failed to fetch products");
    }
};

const createProduct = async (req: AuthenticatedRequest, res: Response) => {
    const actor = getActor(req);

    if (!actor) {
        return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const validation = validateProductBody(req.body, "create");

    if (!validation.ok) {
        return res.status(400).json({
            success: false,
            message: "Please check the product details",
            errors: validation.errors,
        });
    }

    try {
        const result = await productService.createProduct(validation.value, actor);

        return res.status(201).json({ ...result, message: "Product created" });
    } catch (error) {
        return sendProductError(error, res, "Failed to create product");
    }
};

const updateProduct = async (req: AuthenticatedRequest, res: Response) => {
    const actor = getActor(req);
    const id = Number(req.params["id"]);

    if (!actor) {
        return res.status(401).json({ success: false, message: "Authentication required" });
    }

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ success: false, message: "Invalid product id" });
    }

    const validation = validateProductBody(req.body, "update");

    if (!validation.ok) {
        return res.status(400).json({
            success: false,
            message: "Please check the product details",
            errors: validation.errors,
        });
    }

    try {
        const result = await productService.updateProduct(id, validation.value, actor);

        return res.status(200).json({ ...result, message: "Product updated" });
    } catch (error) {
        return sendProductError(error, res, "Failed to update product");
    }
};

export const productController = {
    getProducts,
    getProductBySlug,
    listForManagement,
    createProduct,
    updateProduct,
};