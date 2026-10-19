import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";
import { orderService, OrderError, ORDER_STATUSES } from "./order.service.js";
import type { OrderStatus } from "./order.service.js";
import { validateOrderBody } from "./order.validation.js";
import { paramString } from "../../utils/http.js";

const sendOrderError = (error: unknown, res: Response, fallback: string) => {
    if (error instanceof OrderError) {
        const status =
            error.code === "ORDER_NOT_FOUND" ? 404
                : error.code === "OUT_OF_STOCK" || error.code === "INVALID_TRANSITION" ? 409
                    : 400;

        return res.status(status).json({
            success: false,
            code: error.code,
            message: error.message,
        });
    }

    console.error(fallback, error);

    return res.status(500).json({ success: false, message: fallback });
};

// Works for guests and logged-in users. A logged-in user's order is linked to the account.
const createOrder = async (req: AuthenticatedRequest, res: Response) => {
    const validation = validateOrderBody(req.body);

    if (!validation.ok) {
        return res.status(400).json({
            success: false,
            message: "Please check the order details",
            errors: validation.errors,
        });
    }

    try {
        const result = await orderService.createOrder(
            validation.value,
            typeof req.userId === "number" ? req.userId : null
        );

        return res.status(201).json({ ...result, message: "Order placed successfully" });
    } catch (error) {
        return sendOrderError(error, res, "Failed to place order");
    }
};

const getMyOrders = async (req: AuthenticatedRequest, res: Response) => {
    if (typeof req.userId !== "number") {
        return res.status(401).json({ success: false, message: "Authentication required" });
    }

    try {
        return res.status(200).json(await orderService.getMyOrders(req.userId));
    } catch (error) {
        return sendOrderError(error, res, "Failed to fetch orders");
    }
};

// GET /orders/track/AH-20261018-483920?phone=01712345678
const trackOrder = async (req: Request, res: Response) => {
    const orderNumber = paramString(req.params["orderNumber"]);
    const phone = req.query["phone"];

    if (!orderNumber || typeof phone !== "string" || !phone) {
        return res.status(400).json({
            success: false,
            message: "Order number and phone are required",
        });
    }

    try {
        return res.status(200).json(await orderService.trackOrder(orderNumber, phone));
    } catch (error) {
        return sendOrderError(error, res, "Failed to fetch order");
    }
};

const getAllOrders = async (_req: Request, res: Response) => {
    try {
        return res.status(200).json(await orderService.getAllOrders());
    } catch (error) {
        return sendOrderError(error, res, "Failed to fetch orders");
    }
};

const updateOrderStatus = async (req: Request, res: Response) => {
    const id = Number(req.params["id"]);
    const status = req.body?.status as OrderStatus | undefined;

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ success: false, message: "Invalid order id" });
    }

    if (!status || !ORDER_STATUSES.includes(status)) {
        return res.status(400).json({
            success: false,
            message: `status must be one of: ${ORDER_STATUSES.join(", ")}`,
        });
    }

    try {
        const result = await orderService.updateOrderStatus(id, status);

        return res.status(200).json({ ...result, message: "Order status updated" });
    } catch (error) {
        return sendOrderError(error, res, "Failed to update order status");
    }
};

export const orderController = {
    createOrder,
    getMyOrders,
    trackOrder,
    getAllOrders,
    updateOrderStatus,
};