import type { Request, Response } from "express";
import { CategoryError, categoryService } from "./category.service.js";

const sendCategoryError = (error: unknown, res: Response, fallback: string) => {
    if (error instanceof CategoryError) return res.status(error.code === "SLUG_TAKEN" ? 409 : 404).json({ success: false, code: error.code, message: error.message });
    console.error(fallback, error);
    return res.status(500).json({ success: false, message: fallback });
};

const getCategories = async (_req: Request, res: Response) => {
    try {
        const result = await categoryService.getCategories();

        res.status(200).json(result);
    } catch (error) {
        console.error("Failed to fetch categories:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch categories",
        });
    }
};

const listManagedCategories = async (_req: Request, res: Response) => {
    try { return res.status(200).json(await categoryService.getManagedCategories()); }
    catch (error) { return sendCategoryError(error, res, "Failed to fetch categories"); }
};

const saveCategory = async (req: Request, res: Response, update: boolean) => {
    const raw = req.body;
    const slug = typeof raw?.slug === "string" ? raw.slug.trim() : "";
    const name = typeof raw?.name === "string" ? raw.name.trim().replace(/\s+/g, " ") : "";
    const imageUrl = raw?.imageUrl === null || raw?.imageUrl === "" ? null : typeof raw?.imageUrl === "string" ? raw.imageUrl.trim() : null;
    const description = raw?.description === null || raw?.description === "" ? null : typeof raw?.description === "string" ? raw.description.trim() : null;
    const parentId = raw?.parentId === null || raw?.parentId === "" ? null : raw?.parentId;
    const sortOrder = raw?.sortOrder ?? 0;
    const isActive = raw?.isActive ?? true;
    const errors: Record<string, string> = {};
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) errors.slug = "Slug must be lowercase letters, numbers, and dashes.";
    if (name.length < 2 || name.length > 80) errors.name = "Name must be 2 to 80 characters.";
    if (imageUrl !== null && (imageUrl.length > 500 || !(imageUrl.startsWith("/") || /^https?:\/\//.test(imageUrl)))) errors.imageUrl = "Image URL must start with / or http(s)://.";
    if (description !== null && (typeof description !== "string" || description.length > 1000)) errors.description = "Description must be 1000 characters or fewer.";
    if (parentId !== null && (!Number.isInteger(parentId) || parentId < 1)) errors.parentId = "Parent category is invalid.";
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) errors.sortOrder = "Sort order must be a whole number from 0 to 100000.";
    if (typeof isActive !== "boolean") errors.isActive = "isActive must be true or false.";
    if (Object.keys(errors).length) return res.status(400).json({ success: false, message: "Please check category fields", errors });
    const id = Number(req.params["id"]);
    if (update && (!Number.isInteger(id) || id < 1)) return res.status(400).json({ success: false, message: "Invalid category id" });
    try {
        const input = { slug, name, imageUrl, description, parentId, sortOrder, isActive };
        const result = update ? await categoryService.updateCategory(id, input) : await categoryService.createCategory(input);
        return res.status(update ? 200 : 201).json(result);
    } catch (error) { return sendCategoryError(error, res, "Failed to save category"); }
};

const createCategory = (req: Request, res: Response) => saveCategory(req, res, false);
const updateCategory = (req: Request, res: Response) => saveCategory(req, res, true);

export const categoryController = {
    getCategories,
    listManagedCategories,
    createCategory,
    updateCategory,
};
