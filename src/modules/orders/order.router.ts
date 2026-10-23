import express from "express";
import { orderController } from "./order.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { optionalAuthenticate } from "../../middleware/optionalauth.middleware.js";

const router = express.Router();

// Guests and logged-in users can both place an order.
router.post("/", optionalAuthenticate, orderController.createOrder);

// The logged-in user's own orders. Must stay above "/:id/status" style routes.
router.get("/my", authenticate(), orderController.getMyOrders);

// Guests look up an order with its number and phone number.
router.get("/track/token", orderController.trackOrderByToken);
router.get("/track/:orderNumber", orderController.trackOrder);

// Admin only.
router.get("/", authenticate("ADMIN"), orderController.getAllOrders);
router.patch("/:id/status", authenticate("ADMIN"), orderController.updateOrderStatus);

export const orderRoute = router;
