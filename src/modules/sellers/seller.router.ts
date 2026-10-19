import express from "express";
import { sellerController } from "./seller.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = express.Router();

// Any logged-in user can apply for a shop and check their own application.
router.post("/apply", authenticate(), sellerController.applyForShop);
router.get("/me", authenticate(), sellerController.getMyShop);

// Admin only.
router.get("/", authenticate("ADMIN"), sellerController.listSellers);
router.patch("/:id/status", authenticate("ADMIN"), sellerController.updateSellerStatus);

export const sellerRoute = router;