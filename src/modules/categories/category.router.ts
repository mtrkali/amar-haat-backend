import express from "express";
import { categoryController } from "./category.controller.js";

const router = express.Router();

// Public: the storefront needs the category list without logging in.
router.get("/", categoryController.getCategories);

export const categoryRoute = router;