import { db } from "../../prisma/db.js";
import type { ProductInput } from "./product.validation.js";

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

// What an admin or seller sees: the public fields plus the hidden ones.
const MANAGE_FIELDS = [...PRODUCT_FIELDS, "isActive", "sellerId"] as const;

export type Actor = { userId: number; role: string };

export class ProductError extends Error {
    constructor(
        public code:
            | "PRODUCT_NOT_FOUND"
            | "CATEGORY_NOT_FOUND"
            | "SLUG_TAKEN"
            | "SELLER_NOT_APPROVED"
            | "SELLER_NOT_FOUND"
            | "FORBIDDEN",
        message: string
    ) {
        super(message);
        this.name = "ProductError";
    }
}

const getCategorySlugMap = async () => {
    const categories = await db.orm.public.Category
        .select("id", "slug")
        .all();

    return new Map(categories.map((category) => [category.id, category.slug]));
};

const isUniqueViolation = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    (error as { sqlState?: string }).sqlState === "23505";

// ---------- Public (storefront) ----------

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
        throw new ProductError("PRODUCT_NOT_FOUND", "Product not found");
    }

    const slugById = await getCategorySlugMap();
    const { categoryId, isActive: _isActive, ...rest } = product;

    return {
        success: true,
        data: { ...rest, categorySlug: slugById.get(categoryId) ?? null },
    };
};

// ---------- Admin and seller ----------

// A seller may only manage products once an admin has approved the shop.
const getApprovedSellerId = async (userId: number): Promise<number> => {
    const seller = await db.orm.public.Seller
        .where({ userId })
        .select("id", "status")
        .first();

    if (!seller) {
        throw new ProductError("SELLER_NOT_FOUND", "You do not have a shop yet");
    }

    if (seller.status !== "APPROVED") {
        throw new ProductError("SELLER_NOT_APPROVED", "Your shop is not approved");
    }

    return seller.id;
};

const getCategoryId = async (slug: string): Promise<number> => {
    const category = await db.orm.public.Category
        .where({ slug })
        .select("id")
        .first();

    if (!category) {
        throw new ProductError("CATEGORY_NOT_FOUND", `Category "${slug}" does not exist`);
    }

    return category.id;
};

// Turns a database row into the shape the API returns.
const toManageView = <T extends { categoryId: number }>(
    product: T,
    slugById: Map<number, string>
) => {
    const { categoryId, ...rest } = product;

    return { ...rest, categorySlug: slugById.get(categoryId) ?? null };
};

const listForManagement = async (actor: Actor) => {
    const slugById = await getCategorySlugMap();

    // An ADMIN sees every product. A SELLER sees only their own.
    const products =
        actor.role === "ADMIN"
            ? await db.orm.public.Product.select(...MANAGE_FIELDS).all()
            : await db.orm.public.Product
                .where({ sellerId: await getApprovedSellerId(actor.userId) })
                .select(...MANAGE_FIELDS)
                .all();

    return {
        success: true,
        data: products.map((product) => toManageView(product, slugById)),
    };
};

const createProduct = async (input: ProductInput, actor: Actor) => {
    // A seller's product always belongs to their own shop. An admin may pick a shop, or none.
    const sellerId =
        actor.role === "ADMIN"
            ? input.sellerId ?? null
            : await getApprovedSellerId(actor.userId);

    const categoryId = await getCategoryId(input.categorySlug!);

    const taken = await db.orm.public.Product
        .where({ slug: input.slug! })
        .select("id")
        .first();

    if (taken) {
        throw new ProductError("SLUG_TAKEN", `Slug "${input.slug}" is already used`);
    }

    const now = new Date().toISOString();

    let created: { id: number };

    try {
        created = await (db.orm.public.Product as any).create({
            slug: input.slug,
            name: input.name,
            description: input.description ?? null,
            categoryId,
            sellerId,
            price: input.price,
            oldPrice: input.oldPrice ?? null,
            stock: input.stock,
            imageUrl: input.imageUrl ?? null,
            isActive: input.isActive ?? true,
            createdAt: now,
            updatedAt: now,
        });
    } catch (error) {
        if (isUniqueViolation(error)) {
            throw new ProductError("SLUG_TAKEN", `Slug "${input.slug}" is already used`);
        }

        throw error;
    }

    return getManagedProduct(created.id);
};

const getManagedProduct = async (productId: number) => {
    const product = await db.orm.public.Product
        .where({ id: productId })
        .select(...MANAGE_FIELDS)
        .first();

    if (!product) {
        throw new ProductError("PRODUCT_NOT_FOUND", "Product not found");
    }

    return {
        success: true,
        data: toManageView(product, await getCategorySlugMap()),
    };
};

const updateProduct = async (productId: number, input: ProductInput, actor: Actor) => {
    const product = await db.orm.public.Product
        .where({ id: productId })
        .select("id", "sellerId")
        .first();

    if (!product) {
        throw new ProductError("PRODUCT_NOT_FOUND", "Product not found");
    }

    // A seller can only touch their own products.
    if (actor.role !== "ADMIN") {
        const mySellerId = await getApprovedSellerId(actor.userId);

        if (product.sellerId !== mySellerId) {
            throw new ProductError("FORBIDDEN", "You can only change your own products");
        }
    }

    const updateData = {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.categorySlug !== undefined && {
            categoryId: await getCategoryId(input.categorySlug),
        }),
        ...(input.price !== undefined && { price: input.price }),
        ...(input.oldPrice !== undefined && { oldPrice: input.oldPrice }),
        ...(input.stock !== undefined && { stock: input.stock }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        updatedAt: new Date().toISOString(),
    };

    await db.orm.public.Product
        .where({ id: productId })
        .select("id")
        .update(updateData);

    return getManagedProduct(productId);
};

export const productService = {
    getProducts,
    getProductBySlug,
    listForManagement,
    createProduct,
    updateProduct,
};