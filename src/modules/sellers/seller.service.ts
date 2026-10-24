import { db } from "../../prisma/db.js";
import { timestamp } from "../../utils/http.js";

export type SellerStatus = "PENDING" | "APPROVED" | "SUSPENDED";

export const SELLER_STATUSES: SellerStatus[] = ["PENDING", "APPROVED", "SUSPENDED"];

export class SellerError extends Error {
    constructor(
        public code: "ALREADY_APPLIED" | "SELLER_NOT_FOUND" | "USER_NOT_FOUND" | "SELLER_NOT_APPROVED" | "PRODUCT_NOT_FOUND",
        message: string
    ) {
        super(message);
        this.name = "SellerError";
    }
}

const SELLER_FIELDS = ["id", "userId", "slug", "shopName", "imageUrl", "status"] as const;

const isUniqueViolation = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    (error as { sqlState?: string }).sqlState === "23505";

// Any logged-in user can apply for a shop. It starts as PENDING until an admin approves it.
const applyForShop = async (userId: number, shopName: string) => {
    const existing = await db.orm.public.Seller
        .where({ userId })
        .select("id")
        .first();

    if (existing) {
        throw new SellerError("ALREADY_APPLIED", "You have already applied for a shop");
    }

    try {
        const seller = await (db.orm.public.Seller as any).create({
            userId,
            slug: `shop-${userId}`,
            shopName,
            status: "PENDING",
        });

        return { success: true, data: await getSellerById(seller.id) };
    } catch (error) {
        if (isUniqueViolation(error)) {
            throw new SellerError("ALREADY_APPLIED", "You have already applied for a shop");
        }

        throw error;
    }
};

const getSellerById = async (id: number) => {
    const seller = await db.orm.public.Seller
        .where({ id })
        .select(...SELLER_FIELDS)
        .first();

    if (!seller) {
        throw new SellerError("SELLER_NOT_FOUND", "Shop not found");
    }

    return seller;
};

const getMyShop = async (userId: number) => {
    const seller = await db.orm.public.Seller
        .where({ userId })
        .select(...SELLER_FIELDS)
        .first();

    if (!seller) {
        throw new SellerError("SELLER_NOT_FOUND", "You do not have a shop yet");
    }

    return { success: true, data: seller };
};

const getApprovedShopForUser = async (userId: number) => {
    const seller = await db.orm.public.Seller.where({ userId }).select(...SELLER_FIELDS).first();
    if (!seller) throw new SellerError("SELLER_NOT_FOUND", "You do not have a shop yet");
    if (seller.status !== "APPROVED") throw new SellerError("SELLER_NOT_APPROVED", "Your shop is not approved");
    return seller;
};

const getDashboard = async (userId: number) => {
    const seller = await getApprovedShopForUser(userId);
    const products = await db.orm.public.Product.where({ sellerId: seller.id })
        .select("id", "slug", "name", "price", "stock", "isActive", "updatedAt")
        .all();
    const orders = await db.orm.public.Order.where({ sellerId: seller.id })
        .select("id", "orderNumber", "groupId", "customerName", "customerPhone", "subtotal", "deliveryFee", "total", "status", "createdAt")
        .all();
    const newestOrders = [...orders].sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime());
    const orderDetails = await Promise.all(newestOrders.map(async (order) => ({
        ...order,
        items: await db.orm.public.OrderItem.where({ orderId: order.id })
            .select("id", "productName", "unitPrice", "quantity", "lineTotal")
            .all(),
    })));

    return {
        success: true,
        data: {
            shop: seller,
            overview: {
                totalProducts: products.length,
                activeProducts: products.filter((product) => product.isActive).length,
                lowStockProducts: products.filter((product) => product.stock > 0 && product.stock <= 5).length,
                outOfStockProducts: products.filter((product) => product.stock === 0).length,
                totalOrders: orders.length,
                pendingOrders: orders.filter((order) => order.status === "PENDING").length,
                deliveredOrders: orders.filter((order) => order.status === "DELIVERED").length,
                deliveredSales: orders.filter((order) => order.status === "DELIVERED").reduce((sum, order) => sum + order.subtotal, 0),
            },
            products,
            orders: orderDetails,
        },
    };
};

const updateMyProductStock = async (userId: number, productId: number, stock: number) => {
    const seller = await getApprovedShopForUser(userId);
    const product = await db.orm.public.Product.where({ id: productId, sellerId: seller.id }).select("id").first();
    if (!product) throw new SellerError("PRODUCT_NOT_FOUND", "Product not found");
    await db.orm.public.Product.where({ id: productId, sellerId: seller.id }).select("id").update({ stock, updatedAt: timestamp() });
    const updated = await db.orm.public.Product.where({ id: productId, sellerId: seller.id })
        .select("id", "slug", "name", "price", "stock", "isActive", "updatedAt")
        .first();
    return { success: true, data: updated };
};

// Admin: all shops.
const listSellers = async () => {
    const sellers = await db.orm.public.Seller
        .select(...SELLER_FIELDS)
        .all();

    return { success: true, data: sellers };
};

// Admin: approve, suspend, or set a shop back to pending.
// The owner's account role follows the shop status, so APPROVED makes them a SELLER.
const updateSellerStatus = async (sellerId: number, status: SellerStatus) => {
    const seller = await getSellerById(sellerId);

    await db.orm.public.Seller
        .where({ id: sellerId })
        .select("id")
        .update({ status });

    const user = await db.orm.public.User
        .where({ id: seller.userId })
        .select("id", "role")
        .first();

    if (!user) {
        throw new SellerError("USER_NOT_FOUND", "The shop owner's account was not found");
    }

    // Never change an ADMIN's role.
    if (user.role !== "ADMIN") {
        await db.orm.public.User
            .where({ id: user.id })
            .select("id")
            .update({
                role: status === "APPROVED" ? "SELLER" : "CUSTOMER",
                updatedAt: timestamp(),
            });
    }

    return { success: true, data: await getSellerById(sellerId) };
};

export const sellerService = {
    applyForShop,
    getMyShop,
    getDashboard,
    updateMyProductStock,
    listSellers,
    updateSellerStatus,
};
