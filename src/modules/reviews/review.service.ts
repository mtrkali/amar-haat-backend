import { db } from "../../prisma/db.js";

export class ReviewError extends Error {
    constructor(
        public code:
            | "PRODUCT_NOT_FOUND"
            | "NOT_PURCHASED"
            | "ALREADY_REVIEWED"
            | "REVIEW_NOT_FOUND",
        message: string
    ) {
        super(message);
        this.name = "ReviewError";
    }
}

export type RatingSummary = { rating: number; reviewCount: number };

const newestFirst = <T extends { createdAt: unknown }>(rows: T[]): T[] =>
    [...rows].sort(
        (a, b) =>
            new Date(String(b.createdAt)).getTime() -
            new Date(String(a.createdAt)).getTime()
    );

const summarize = (ratings: number[]): RatingSummary => {
    if (ratings.length === 0) {
        return { rating: 0, reviewCount: 0 };
    }

    const sum = ratings.reduce((total, r) => total + r, 0);

    // One decimal place, like the storefront shows (4.7).
    return {
        rating: Math.round((sum / ratings.length) * 10) / 10,
        reviewCount: ratings.length,
    };
};

// Average rating and review count for every product that has visible reviews.
// Products with no reviews are simply missing from the map.
const getRatingSummaries = async (): Promise<Map<number, RatingSummary>> => {
    const reviews = await db.orm.public.Review
        .select("productId", "rating", "isVisible")
        .all();

    const byProduct = new Map<number, number[]>();

    for (const review of reviews) {
        if (!review.isVisible) continue;

        const list = byProduct.get(review.productId) ?? [];
        list.push(review.rating);
        byProduct.set(review.productId, list);
    }

    return new Map(
        [...byProduct.entries()].map(([productId, ratings]) => [productId, summarize(ratings)])
    );
};

const getActiveProductBySlug = async (slug: string) => {
    const product = await db.orm.public.Product
        .where({ slug })
        .select("id", "isActive")
        .first();

    if (!product || !product.isActive) {
        throw new ReviewError("PRODUCT_NOT_FOUND", "Product not found");
    }

    return product;
};

// Public: the reviews on a product page.
const getProductReviews = async (slug: string) => {
    const product = await getActiveProductBySlug(slug);

    const all = await db.orm.public.Review
        .where({ productId: product.id })
        .select("id", "userId", "rating", "comment", "isVisible", "createdAt")
        .all();

    const visible = newestFirst(all.filter((review) => review.isVisible));

    // Show only the reviewer's first name, for privacy.
    const nameByUser = new Map<number, string>();

    for (const review of visible) {
        if (nameByUser.has(review.userId)) continue;

        const user = await db.orm.public.User
            .where({ id: review.userId })
            .select("name")
            .first();

        nameByUser.set(review.userId, user?.name.split(" ")[0] ?? "গ্রাহক");
    }

    return {
        success: true,
        summary: summarize(visible.map((review) => review.rating)),
        data: visible.map((review) => ({
            id: review.id,
            rating: review.rating,
            comment: review.comment,
            reviewerName: nameByUser.get(review.userId) ?? "গ্রাহক",
            createdAt: review.createdAt,
        })),
    };
};

// Has this user received (DELIVERED) an order that contained this product?
const hasReceivedProduct = async (userId: number, productId: number): Promise<boolean> => {
    const orders = await db.orm.public.Order
        .where({ userId })
        .select("id", "status")
        .all();

    for (const order of orders) {
        if (order.status !== "DELIVERED") continue;

        const items = await db.orm.public.OrderItem
            .where({ orderId: order.id })
            .select("productId")
            .all();

        if (items.some((item) => item.productId === productId)) {
            return true;
        }
    }

    return false;
};

const createReview = async (
    slug: string,
    userId: number,
    input: { rating: number; comment: string | null }
) => {
    const product = await getActiveProductBySlug(slug);

    const existing = await db.orm.public.Review
        .where({ productId: product.id })
        .select("userId")
        .all();

    if (existing.some((review) => review.userId === userId)) {
        throw new ReviewError("ALREADY_REVIEWED", "You have already reviewed this product");
    }

    if (!(await hasReceivedProduct(userId, product.id))) {
        throw new ReviewError(
            "NOT_PURCHASED",
            "You can review a product after you have received it"
        );
    }

    const review = await (db.orm.public.Review as any).create({
        productId: product.id,
        userId,
        rating: input.rating,
        comment: input.comment,
        isVisible: true,
        createdAt: new Date().toISOString(),
    });

    return {
        success: true,
        data: {
            id: review.id,
            rating: input.rating,
            comment: input.comment,
        },
    };
};

// Admin: every review, including hidden ones.
const listAllReviews = async () => {
    const reviews = await db.orm.public.Review
        .select("id", "productId", "userId", "rating", "comment", "isVisible", "createdAt")
        .all();

    return { success: true, data: newestFirst(reviews) };
};

const setReviewVisibility = async (id: number, isVisible: boolean) => {
    const review = await db.orm.public.Review
        .where({ id })
        .select("id")
        .first();

    if (!review) {
        throw new ReviewError("REVIEW_NOT_FOUND", "Review not found");
    }

    const updated = await db.orm.public.Review
        .where({ id })
        .select("id", "productId", "userId", "rating", "comment", "isVisible", "createdAt")
        .update({ isVisible });

    return { success: true, data: updated };
};

export const reviewService = {
    getRatingSummaries,
    getProductReviews,
    createReview,
    listAllReviews,
    setReviewVisibility,
};