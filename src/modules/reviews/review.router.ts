import express from "express";
import { reviewController } from "./review.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

// Mounted at /products, so these become /products/:slug/reviews
const productReviewRouter = express.Router();

productReviewRouter.get("/:slug/reviews", reviewController.getProductReviews);
productReviewRouter.post("/:slug/reviews", authenticate(), reviewController.createReview);

// Mounted at /reviews, admin moderation only.
const reviewAdminRouter = express.Router();

reviewAdminRouter.get("/", authenticate("ADMIN"), reviewController.listAllReviews);
reviewAdminRouter.patch("/:id/visibility", authenticate("ADMIN"), reviewController.setReviewVisibility);

export const productReviewRoute = productReviewRouter;
export const reviewAdminRoute = reviewAdminRouter;