import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";
import { sellerService, SellerError, SELLER_STATUSES } from "./seller.service.js";
import type { SellerStatus } from "./seller.service.js";

const sendSellerError = (error: unknown, res: Response, fallback: string) => {
    if (error instanceof SellerError) {
        const status =
            error.code === "ALREADY_APPLIED" ? 409
                : error.code === "SELLER_NOT_APPROVED" ? 403
                : 404; // SELLER_NOT_FOUND, USER_NOT_FOUND

        return res.status(status).json({
            success: false,
            code: error.code,
            message: error.message,
        });
    }

    console.error(fallback, error);

    return res.status(500).json({ success: false, message: fallback });
};

const applyForShop = async (req: AuthenticatedRequest, res: Response) => {
    if (typeof req.userId !== "number") {
        return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const raw: unknown = req.body?.shopName;
    const shopName = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";

    if (shopName.length < 2 || shopName.length > 60) {
        return res.status(400).json({
            success: false,
            message: "Shop name must be 2 to 60 characters",
        });
    }

    try {
        const result = await sellerService.applyForShop(req.userId, shopName);

        return res.status(201).json({
            ...result,
            message: "Application sent. An admin will review it.",
        });
    } catch (error) {
        return sendSellerError(error, res, "Failed to send application");
    }
};

const getMyShop = async (req: AuthenticatedRequest, res: Response) => {
    if (typeof req.userId !== "number") {
        return res.status(401).json({ success: false, message: "Authentication required" });
    }

    try {
        return res.status(200).json(await sellerService.getMyShop(req.userId));
    } catch (error) {
        return sendSellerError(error, res, "Failed to fetch shop");
    }
};

const getDashboard = async (req: AuthenticatedRequest, res: Response) => {
    if (typeof req.userId !== "number") return res.status(401).json({ success: false, message: "Authentication required" });
    try {
        return res.status(200).json(await sellerService.getDashboard(req.userId));
    } catch (error) {
        return sendSellerError(error, res, "Failed to fetch seller dashboard");
    }
};

const updateProductStock = async (req: AuthenticatedRequest, res: Response) => {
    if (typeof req.userId !== "number") return res.status(401).json({ success: false, message: "Authentication required" });
    const productId = Number(req.params["id"]);
    const stock: unknown = req.body?.stock;
    if (!Number.isInteger(productId) || productId < 1) return res.status(400).json({ success: false, message: "Invalid product id" });
    if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0 || stock > 1_000_000) {
        return res.status(400).json({ success: false, message: "Stock must be a whole number from 0 to 1000000" });
    }
    try {
        return res.status(200).json({ ...await sellerService.updateMyProductStock(req.userId, productId, stock), message: "Stock updated" });
    } catch (error) {
        return sendSellerError(error, res, "Failed to update stock");
    }
};

const listSellers = async (_req: Request, res: Response) => {
    try {
        return res.status(200).json(await sellerService.listSellers());
    } catch (error) {
        return sendSellerError(error, res, "Failed to fetch shops");
    }
};

const updateSellerStatus = async (req: Request, res: Response) => {
    const id = Number(req.params["id"]);
    const status = req.body?.status as SellerStatus | undefined;

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ success: false, message: "Invalid shop id" });
    }

    if (!status || !SELLER_STATUSES.includes(status)) {
        return res.status(400).json({
            success: false,
            message: `status must be one of: ${SELLER_STATUSES.join(", ")}`,
        });
    }

    try {
        const result = await sellerService.updateSellerStatus(id, status);

        return res.status(200).json({ ...result, message: "Shop status updated" });
    } catch (error) {
        return sendSellerError(error, res, "Failed to update shop status");
    }
};

export const sellerController = {
    applyForShop,
    getMyShop,
    getDashboard,
    updateProductStock,
    listSellers,
    updateSellerStatus,
};
