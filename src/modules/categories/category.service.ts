import { db } from "../../prisma/db.js";

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

export const categoryService = {
    getCategories,
};