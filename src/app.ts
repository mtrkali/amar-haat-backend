import express from "express";
import cors from "cors";
import { healthRoute } from "./modules/health/health.router.js";
import { userRoute } from "./modules/users/user.router.js";
import { categoryRoute } from "./modules/categories/category.router.js";
import { productRoute } from "./modules/products/product.router.js";
import { orderRoute } from "./modules/orders/order.router.js";
import { sellerRoute } from "./modules/sellers/seller.router.js";
import { productReviewRoute, reviewAdminRoute } from "./modules/reviews/review.router.js";
import { faqRoute, testimonialRoute } from "./modules/contents/content.router.js";

const app = express();

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
app.use(express.json());

app.use("/health", healthRoute);
app.use("/users", userRoute);
app.use("/categories", categoryRoute);
app.use("/products", productReviewRoute);
app.use("/products", productRoute);
app.use("/reviews", reviewAdminRoute);
app.use("/faqs", faqRoute);
app.use("/testimonials", testimonialRoute);
app.use("/orders", orderRoute);
app.use("/sellers", sellerRoute);

export default app;