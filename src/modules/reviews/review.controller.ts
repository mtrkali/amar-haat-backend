import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";
import { reviewService, ReviewError } from "./review.service.js";
import { paramString } from "../../utils/http.js";

const sendReviewError = (error: unknown, res: Response, fallback: string) => {
    if (error instanceof ReviewError) {
        const status =
            error.code === "PRODUCT_NOT_FOUND" || error.code === "REVIEW_NOT_FOUND" ? 404
                : error.code === "ALREADY_REVIEWED" ? 409
                    : 403; // NOT_PURCHASED

        return res.status(status).json({
            success: false,
            code: error.code,
            message: error.message,
        });
    }

    console.error(fallback, error);

    return res.status(500).json({ success: false, message: fallback });
};

const getProductReviews = async (req: Request, res: Response) => {
    const slug = paramString(req.params["slug"]);

    if (!slug) {
        return res.status(400).json({ success: false, message: "Product slug is required" });
    }

    try {
        return res.status(200).json(await reviewService.getProductReviews(slug));
    } catch (error) {
        return sendReviewError(error, res, "Failed to fetch reviews");
    }
};

const createReview = async (req: AuthenticatedRequest, res: Response) => {
    const slug = paramString(req.params["slug"]);

    if (typeof req.userId !== "number") {
        return res.status(401).json({ success: false, message: "Authentication required" });
    }

    if (!slug) {
        return res.status(400).json({ success: false, message: "Product slug is required" });
    }

    const rating: unknown = req.body?.rating;
    const rawComment: unknown = req.body?.comment;

    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({
            success: false,
            message: "Rating must be a whole number from 1 to 5",
        });
    }

    let comment: string | null = null;

    if (rawComment !== undefined && rawComment !== null) {
        if (typeof rawComment !== "string" || rawComment.trim().length > 500) {
            return res.status(400).json({
                success: false,
                message: "Comment must be 500 characters or fewer",
            });
        }

        comment = rawComment.trim() || null;
    }

    try {
        const result = await reviewService.createReview(slug, req.userId, { rating, comment });

        return res.status(201).json({ ...result, message: "Thank you for your review" });
    } catch (error) {
        return sendReviewError(error, res, "Failed to save review");
    }
};

const listAllReviews = async (_req: Request, res: Response) => {
    try {
        return res.status(200).json(await reviewService.listAllReviews());
    } catch (error) {
        return sendReviewError(error, res, "Failed to fetch reviews");
    }
};

const setReviewVisibility = async (req: Request, res: Response) => {
    const id = Number(req.params["id"]);
    const isVisible: unknown = req.body?.isVisible;

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ success: false, message: "Invalid review id" });
    }

    if (typeof isVisible !== "boolean") {
        return res.status(400).json({
            success: false,
            message: "isVisible must be true or false",
        });
    }

    try {
        const result = await reviewService.setReviewVisibility(id, isVisible);

        return res.status(200).json({ ...result, message: "Review updated" });
    } catch (error) {
        return sendReviewError(error, res, "Failed to update review");
    }
};

export const reviewController = {
    getProductReviews,
    createReview,
    listAllReviews,
    setReviewVisibility,
};