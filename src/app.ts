import express from "express";
import cors from "cors";
import helmet from "helmet";
import { healthRoute } from "./modules/health/health.router.js";
import { userRoute } from "./modules/users/user.router.js";
import { categoryRoute } from "./modules/categories/category.router.js";
import { productRoute } from "./modules/products/product.router.js";
import { orderRoute } from "./modules/orders/order.router.js";
import { sellerRoute } from "./modules/sellers/seller.router.js";
import { deliveryRoute } from "./modules/delivery/delivery.router.js";
import { productReviewRoute, reviewAdminRoute } from "./modules/reviews/review.router.js";
import { faqRoute, testimonialRoute } from "./modules/contents/content.router.js";
import {
    authLimiter,
    generalLimiter,
    orderLimiter,
    reviewLimiter,
} from "./middleware/rateLimit.middleware.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";

const app = express();

// Render (and most hosts) put a proxy in front of the app. Without this line every
// visitor would look like the same IP address and the rate limits would hit everyone at once.
app.set("trust proxy", 1);

// Safe default security headers.
app.use(helmet());

// CORS_ORIGIN can hold one or more frontend URLs separated by commas.
// If it is not set, every origin is allowed (fine for local development only).
const allowedOrigins = process.env["CORS_ORIGIN"]
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(
    cors(
        allowedOrigins && allowedOrigins.length > 0
            ? { origin: allowedOrigins }
            : {},
    ),
);

// Orders, reviews and product forms are small. 100 kb is plenty.
app.use(express.json({ limit: "100kb" }));

// Health check comes before the rate limit so Render's checks are never blocked.
app.use("/health", healthRoute);

app.use(generalLimiter);

// Stricter limits on the routes bots like to hammer.
app.use(["/users/login", "/users/register"], authLimiter);
app.post("/orders", orderLimiter);
app.post("/products/:slug/reviews", reviewLimiter);

app.use("/users", userRoute);
app.use("/categories", categoryRoute);
app.use("/products", productReviewRoute);
app.use("/products", productRoute);
app.use("/reviews", reviewAdminRoute);
app.use("/faqs", faqRoute);
app.use("/testimonials", testimonialRoute);
app.use("/orders", orderRoute);
app.use("/sellers", sellerRoute);
app.use("/delivery", deliveryRoute);

// These two must stay last.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
