import express from "express";
import { contentController } from "./content.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

// Mounted at /faqs
const faqRouter = express.Router();

faqRouter.get("/", contentController.listFaqs); // public
faqRouter.get("/manage", authenticate("ADMIN"), contentController.listAllFaqs); // includes hidden ones
faqRouter.post("/", authenticate("ADMIN"), contentController.createFaq);
faqRouter.patch("/:id", authenticate("ADMIN"), contentController.updateFaq);

// Mounted at /testimonials
const testimonialRouter = express.Router();

testimonialRouter.get("/", contentController.listTestimonials); // public
testimonialRouter.get("/manage", authenticate("ADMIN"), contentController.listAllTestimonials);
testimonialRouter.post("/", authenticate("ADMIN"), contentController.createTestimonial);
testimonialRouter.patch("/:id", authenticate("ADMIN"), contentController.updateTestimonial);

export const faqRoute = faqRouter;
export const testimonialRoute = testimonialRouter;