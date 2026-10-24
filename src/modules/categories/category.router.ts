import express from "express";
import { categoryController } from "./category.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = express.Router();

// Public: the storefront needs the category list without logging in.
router.get("/", categoryController.getCategories);
router.get("/manage", authenticate("ADMIN"), categoryController.listManagedCategories);
router.post("/", authenticate("ADMIN"), categoryController.createCategory);
router.patch("/:id", authenticate("ADMIN"), categoryController.updateCategory);

export const categoryRoute = router;
