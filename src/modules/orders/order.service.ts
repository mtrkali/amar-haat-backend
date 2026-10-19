import { randomInt } from "node:crypto";
import { db } from "../../prisma/db.js";
import type { ValidatedOrder } from "./order.validation.js";
import { normalizePhone } from "./order.validation.js";

// TODO: decide the real delivery fee (flat, or per upazila). 0 for now.
export const DELIVERY_FEE = 0;

export type OrderStatus =
    | "PENDING"
    | "CONFIRMED"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "CANCELLED";

// Which status changes an admin may make.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["OUT_FOR_DELIVERY", "CANCELLED"],
    OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
    DELIVERED: [],
    CANCELLED: [],
};

export const ORDER_STATUSES = Object.keys(ALLOWED_TRANSITIONS) as OrderStatus[];

// An error with a code the controller can turn into a proper HTTP response.
export class OrderError extends Error {
    constructor(
        public code:
            | "PRODUCT_UNAVAILABLE"
            | "OUT_OF_STOCK"
            | "ORDER_NOT_FOUND"
            | "INVALID_TRANSITION",
        message: string
    ) {
        super(message);
        this.name = "OrderError";
    }
}

const ORDER_FIELDS = [
    "id",
    "orderNumber",
    "userId",
    "customerName",
    "customerPhone",
    "upazila",
    "union",
    "ward",
    "address",
    "note",
    "subtotal",
    "deliveryFee",
    "total",
    "paymentMethod",
    "status",
    "createdAt",
    "updatedAt",
] as const;

const ITEM_FIELDS = [
    "id",
    "productName",
    "unitPrice",
    "quantity",
    "lineTotal",
] as const;

const getItems = async (orderId: number) =>
    db.orm.public.OrderItem
        .where({ orderId })
        .select(...ITEM_FIELDS)
        .all();

const newestFirst = <T extends { createdAt: string }>(rows: T[]): T[] =>
    [...rows].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

// "AH-20261018-483920": easy to read out over the phone.
const makeOrderNumber = (): string => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    return `AH-${date}-${randomInt(100000, 1000000)}`;
};

const isUniqueViolation = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    (error as { sqlState?: string }).sqlState === "23505";

const createOrder = async (input: ValidatedOrder, userId: number | null) => {
    // Step 1: load every product from the database. Prices come from here, never from the browser.
    const lines: {
        productId: number;
        name: string;
        unitPrice: number;
        quantity: number;
        stock: number;
    }[] = [];

    for (const item of input.items) {
        const product = await db.orm.public.Product
            .where({ slug: item.productSlug })
            .select("id", "name", "price", "stock", "isActive")
            .first();

        if (!product || !product.isActive) {
            throw new OrderError(
                "PRODUCT_UNAVAILABLE",
                `Product "${item.productSlug}" is not available`
            );
        }

        if (product.stock < item.quantity) {
            throw new OrderError(
                "OUT_OF_STOCK",
                `Not enough stock for "${product.name}" (available: ${product.stock})`
            );
        }

        lines.push({
            productId: product.id,
            name: product.name,
            unitPrice: product.price,
            quantity: item.quantity,
            stock: product.stock,
        });
    }

    // Step 2: totals.
    const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    const total = subtotal + DELIVERY_FEE;
    const now = new Date().toISOString();

    // Step 3: create the order (retry if the random order number is already taken).
    let order: { id: number } | undefined;

    for (let attempt = 0; attempt < 3 && !order; attempt++) {
        try {
            order = await (db.orm.public.Order as any).create({
                orderNumber: makeOrderNumber(),
                userId,
                customerName: input.customerName,
                customerPhone: input.customerPhone,
                upazila: input.upazila,
                union: input.union,
                ward: input.ward,
                address: input.address,
                note: input.note,
                subtotal,
                deliveryFee: DELIVERY_FEE,
                total,
                paymentMethod: "COD",
                status: "PENDING",
                createdAt: now,
                updatedAt: now,
            });
        } catch (error) {
            if (!isUniqueViolation(error) || attempt === 2) throw error;
        }
    }

    if (!order) {
        throw new Error("Could not create order");
    }

    const orderId = order.id;

    // Step 4: save the items and reduce stock.
    // NOTE: these steps are not one database transaction yet (see the notes in the reply).
    // If something fails, the order is marked CANCELLED so it never looks like a real order.
    try {
        for (const line of lines) {
            await (db.orm.public.OrderItem as any).create({
                orderId,
                productId: line.productId,
                productName: line.name,
                unitPrice: line.unitPrice,
                quantity: line.quantity,
                lineTotal: line.unitPrice * line.quantity,
            });
        }

        for (const line of lines) {
            await db.orm.public.Product
                .where({ id: line.productId })
                .select("id")
                .update({ stock: line.stock - line.quantity, updatedAt: now });
        }
    } catch (error) {
        await db.orm.public.Order
            .where({ id: orderId })
            .select("id")
            .update({ status: "CANCELLED", updatedAt: new Date().toISOString() });

        throw error;
    }

    return getOrderById(orderId);
};

const getOrderById = async (orderId: number) => {
    const order = await db.orm.public.Order
        .where({ id: orderId })
        .select(...ORDER_FIELDS)
        .first();

    if (!order) {
        throw new OrderError("ORDER_NOT_FOUND", "Order not found");
    }

    return {
        success: true,
        data: { ...order, items: await getItems(order.id) },
    };
};

const getMyOrders = async (userId: number) => {
    const orders = await db.orm.public.Order
        .where({ userId })
        .select(...ORDER_FIELDS)
        .all();

    const data = await Promise.all(
        newestFirst(orders).map(async (order) => ({
            ...order,
            items: await getItems(order.id),
        }))
    );

    return { success: true, data };
};

// Guests have no account, so they look an order up with its number AND the phone used.
const trackOrder = async (orderNumber: string, phone: string) => {
    const order = await db.orm.public.Order
        .where({ orderNumber })
        .select(...ORDER_FIELDS)
        .first();

    if (!order || order.customerPhone !== normalizePhone(phone)) {
        throw new OrderError("ORDER_NOT_FOUND", "Order not found");
    }

    return {
        success: true,
        data: { ...order, items: await getItems(order.id) },
    };
};

// Admin: every order, newest first (no items, to keep the list light).
const getAllOrders = async () => {
    const orders = await db.orm.public.Order
        .select(...ORDER_FIELDS)
        .all();

    return { success: true, data: newestFirst(orders) };
};

const updateOrderStatus = async (orderId: number, newStatus: OrderStatus) => {
    const order = await db.orm.public.Order
        .where({ id: orderId })
        .select("id", "status")
        .first();

    if (!order) {
        throw new OrderError("ORDER_NOT_FOUND", "Order not found");
    }

    const current = order.status as OrderStatus;

    if (!ALLOWED_TRANSITIONS[current].includes(newStatus)) {
        throw new OrderError(
            "INVALID_TRANSITION",
            `An order that is ${current} cannot become ${newStatus}`
        );
    }

    const now = new Date().toISOString();

    await db.orm.public.Order
        .where({ id: orderId })
        .select("id")
        .update({ status: newStatus, updatedAt: now });

    // A cancelled order gives its stock back.
    if (newStatus === "CANCELLED") {
        const items = await db.orm.public.OrderItem
            .where({ orderId })
            .select("productId", "quantity")
            .all();

        for (const item of items) {
            if (item.productId === null) continue;

            const product = await db.orm.public.Product
                .where({ id: item.productId })
                .select("id", "stock")
                .first();

            if (!product) continue;

            await db.orm.public.Product
                .where({ id: product.id })
                .select("id")
                .update({ stock: product.stock + item.quantity, updatedAt: now });
        }
    }

    return getOrderById(orderId);
};

export const orderService = {
    createOrder,
    getMyOrders,
    trackOrder,
    getAllOrders,
    updateOrderStatus,
};