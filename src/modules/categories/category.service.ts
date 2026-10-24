import { db } from "../../prisma/db.js";

export class CategoryError extends Error {
    constructor(public code: "CATEGORY_NOT_FOUND" | "SLUG_TAKEN", message: string) {
        super(message);
        this.name = "CategoryError";
    }
}

const getCategories = async () => {
    const categories = await db.orm.public.Category
        .where({ isActive: true })
        .select("id", "slug", "name", "imageUrl", "sortOrder")
        .all();

    // The catalog is small, so sorting in code is fine for now.
    const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

    return {
        success: true,
        data: sorted.map(({ sortOrder: _sortOrder, ...category }) => category),
    };
};

const getManagedCategories = async () => {
    const data = await db.orm.public.Category.select("id", "slug", "name", "imageUrl", "description", "parentId", "sortOrder", "isActive").all();
    return { success: true, data: [...data].sort((a, b) => a.sortOrder - b.sortOrder) };
};

const saveCategory = async (input: {
    slug: string; name: string; imageUrl: string | null; description: string | null;
    parentId: number | null; sortOrder: number; isActive: boolean;
}, id?: number) => {
    if (input.parentId !== null) {
        const parent = await db.orm.public.Category.where({ id: input.parentId }).select("id").first();
        if (!parent) throw new CategoryError("CATEGORY_NOT_FOUND", "Parent category not found");
        if (parent.id === id) throw new CategoryError("CATEGORY_NOT_FOUND", "A category cannot be its own parent");
    }
    const existingSlug = await db.orm.public.Category.where({ slug: input.slug }).select("id").first();
    if (existingSlug && existingSlug.id !== id) throw new CategoryError("SLUG_TAKEN", "Category slug is already in use");
    if (id === undefined) {
        const created = await (db.orm.public.Category as any).create(input);
        return getManagedCategoryById(created.id);
    }
    const existing = await db.orm.public.Category.where({ id }).select("id").first();
    if (!existing) throw new CategoryError("CATEGORY_NOT_FOUND", "Category not found");
    await db.orm.public.Category.where({ id }).select("id").update(input);
    return getManagedCategoryById(id);
};

const getManagedCategoryById = async (id: number) => {
    const data = await db.orm.public.Category.where({ id })
        .select("id", "slug", "name", "imageUrl", "description", "parentId", "sortOrder", "isActive")
        .first();
    if (!data) throw new CategoryError("CATEGORY_NOT_FOUND", "Category not found");
    return { success: true, data };
};

export const categoryService = {
    getCategories,
    getManagedCategories,
    createCategory: (input: Parameters<typeof saveCategory>[0]) => saveCategory(input),
    updateCategory: (id: number, input: Parameters<typeof saveCategory>[0]) => saveCategory(input, id),
};
