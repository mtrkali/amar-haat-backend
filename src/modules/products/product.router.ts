import express from "express";
import { productController } from "./product.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = express.Router();

// Public routes for the storefront.
router.get("/", productController.getProducts);

// Admin and seller routes. "/manage" must stay above "/:slug", or it would be read as a slug.
router.get("/manage", authenticate("ADMIN", "SELLER"), productController.listForManagement);
router.post("/", authenticate("ADMIN", "SELLER"), productController.createProduct);
router.patch("/:id", authenticate("ADMIN", "SELLER"), productController.updateProduct);

router.get("/:slug", productController.getProductBySlug);

export const productRoute = router;