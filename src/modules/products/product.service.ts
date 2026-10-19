import { db } from "../../prisma/db.js";

// Fields sent to the storefront. Rating and review count are not here yet:
// they will come from a Review table in a later phase.
const PRODUCT_FIELDS = [
    "id",
    "slug",
    "name",
    "description",
    "categoryId",
    "price",
    "oldPrice",
    "stock",
    "imageUrl",
] as const;

const getCategorySlugMap = async () => {
    const categories = await db.orm.public.Category
        .select("id", "slug")
        .all();

    return new Map(categories.map((category) => [category.id, category.slug]));
};

const getProducts = async (categorySlug?: string) => {
    const slugById = await getCategorySlugMap();

    const products = await db.orm.public.Product
        .where({ isActive: true })
        .select(...PRODUCT_FIELDS)
        .all();

    const data = products
        .map(({ categoryId, ...product }) => ({
            ...product,
            categorySlug: slugById.get(categoryId) ?? null,
        }))
        .filter((product) => !categorySlug || product.categorySlug === categorySlug);

    return { success: true, data };
};

const getProductBySlug = async (slug: string) => {
    const product = await db.orm.public.Product
        .where({ slug })
        .select(...PRODUCT_FIELDS, "isActive")
        .first();

    if (!product || !product.isActive) {
        throw new Error("PRODUCT_NOT_FOUND");
    }

    const slugById = await getCategorySlugMap();
    const { categoryId, isActive: _isActive, ...rest } = product;

    return {
        success: true,
        data: { ...rest, categorySlug: slugById.get(categoryId) ?? null },
    };
};

export const productService = {
    getProducts,
    getProductBySlug,
};