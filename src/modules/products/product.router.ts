import express from "express";
import { productController } from "./product.controller.js";

const router = express.Router();

// Public routes for the storefront.
router.get("/", productController.getProducts);
router.get("/:slug", productController.getProductBySlug);

export const productRoute = router;