import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { db } from "../../prisma/db.js";
import { query, sqlState, INT, int, text } from "../../prisma/sql.js";
import { businessConfig } from "../../config/business.js";
import type { ValidatedOrder } from "./order.validation.js";
import { normalizePhone } from "./order.validation.js";

// The delivery fee now comes from DELIVERY_FEE in the environment (default 0).
// Kept as an export so any other file that imported it keeps working.
export const DELIVERY_FEE = businessConfig.deliveryFee;

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
    "groupId",
    "sellerId",
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

const newestFirst = <T extends { createdAt: unknown }>(rows: T[]): T[] =>
    [...rows].sort(
        (a, b) =>
            new Date(String(b.createdAt)).getTime() -
            new Date(String(a.createdAt)).getTime()
    );

// "AH-20261018-483920": easy to read out over the phone.
const makeOrderNumber = (): string => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    return `AH-${date}-${randomInt(100000, 1000000)}`;
};

const makeGroupNumber = makeOrderNumber;
const hashTrackingToken = (token: string) => createHash("sha256").update(token).digest("hex");
const trackingTokenForAttempt = (key: string | null) => key && process.env["JWT_SECRET"]
    ? createHmac("sha256", process.env["JWT_SECRET"]!).update(`order-tracking:${key}`).digest("base64url")
    : randomBytes(32).toString("base64url");

// PostgreSQL error codes this file reacts to.
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514"; // the "stock can never be negative" safety net
const DIVISION_BY_ZERO = "22012"; // used on purpose as the "not enough stock" alarm, see below
const DEADLOCK = "40P01";
const SERIALIZATION_FAILURE = "40001";

const MAX_ATTEMPTS = 4;

const getOrderById = async (orderId: number) => {
    const order = await db.orm.public.Order
        .where({ id: orderId })
        .select(...ORDER_FIELDS)
        .first();

    if (!order) {
        throw new OrderError("ORDER_NOT_FOUND", "Order not found");
    }

    return {
        success: true as const,
        data: { ...order, items: await getItems(order.id) },
    };
};

export type CreatedOrder = Awaited<ReturnType<typeof getGroupById>> & {
    // true when this request repeated an earlier one and no new order was made
    replayed: boolean;
};

// If this Idempotency-Key was already used, we return that order instead of making another.
const findGroupIdByKey = async (key: string): Promise<number | null> => {
    const rows = await query<{ id: number }>({ id: INT })`
        SELECT id FROM "OrderGroup" WHERE "idempotencyKey" = ${key}::text LIMIT 1
    `;

    const first = rows[0];

    return first ? Number(first.id) : null;
};

// Read-only. Runs only after the all-or-nothing save failed, to tell the customer WHICH product is the problem.
const explainShortage = async (input: ValidatedOrder): Promise<OrderError> => {
    for (const item of input.items) {
        const product = await db.orm.public.Product
            .where({ slug: item.productSlug })
            .select("name", "stock", "isActive")
            .first();

        if (!product || !product.isActive) {
            return new OrderError(
                "PRODUCT_UNAVAILABLE",
                `Product "${item.productSlug}" is not available`
            );
        }

        if (product.stock < item.quantity) {
            return new OrderError(
                "OUT_OF_STOCK",
                `Not enough stock for "${product.name}" (available: ${product.stock})`
            );
        }
    }

    // The stock changed again while we were checking.
    return new OrderError(
        "OUT_OF_STOCK",
        "Some products are no longer available in this quantity"
    );
};

// Creates the order, its items and the stock deduction in ONE SQL statement.
// PostgreSQL treats one statement as one unit: either everything below is saved, or nothing is.
//
//  req    - the requested slugs and quantities (sent from the app as JSON)
//  upd    - lowers stock, but only for products that are active AND have enough stock.
//           The "stock >= qty" test and the "stock - qty" change happen on the same locked row,
//           so two customers can never both take the last item.
//  guard  - if any product was skipped by "upd", this divides by zero on purpose. That error
//           cancels the whole statement, so the stock changes made by "upd" are rolled back too.
//           "ord" multiplies its totals by guard.ok (always 1 when all is well). That use is what
//           forces PostgreSQL to really calculate the guard; if nothing used it, PostgreSQL would
//           skip the calculation and an order with missing products would be saved.
//  ord    - the order row. Prices and totals are calculated here from the database, never from the browser.
//  items  - one row per product, with the name and price copied at this moment (the snapshot).
const insertOrderAtomically = async (
    input: ValidatedOrder,
    userId: number | null,
    idempotencyKey: string | null
): Promise<{ groupId: number; trackingToken: string }> => {
    const requested = JSON.stringify(
        input.items.map((item) => ({ slug: item.productSlug, qty: item.quantity }))
    );

    const fee = businessConfig.deliveryFee;
    const trackingToken = trackingTokenForAttempt(idempotencyKey);
    const trackingTokenHash = hashTrackingToken(trackingToken);

    const rows = await query<{ groupId: number }>({ groupId: INT })`
        WITH req AS (
            SELECT x.slug, SUM(x.qty)::int AS qty
            FROM jsonb_to_recordset(${requested}::jsonb) AS x(slug text, qty int)
            GROUP BY x.slug
        ),
        upd AS (
            UPDATE "Product" p
            SET stock = p.stock - r.qty, "updatedAt" = now()
            FROM req r
            WHERE p.slug = r.slug AND p."isActive" = true AND p.stock >= r.qty
            RETURNING p.id AS "productId", p.name AS "productName", p.price AS "unitPrice", p."sellerId", r.qty AS quantity
        ),
        guard AS MATERIALIZED (
            SELECT 1 / CASE
                WHEN (SELECT count(*) FROM upd) = (SELECT count(*) FROM req) THEN 1
                ELSE 0
            END AS ok
        ),
        totals AS MATERIALIZED (
            SELECT u."sellerId", SUM(u."unitPrice" * u.quantity)::int AS subtotal
            FROM upd u CROSS JOIN guard g
            GROUP BY u."sellerId"
        ),
        grp AS (
            INSERT INTO "OrderGroup" (
                "groupNumber", "userId", "customerName", "customerPhone", subtotal,
                "deliveryFee", discount, total, "paymentMethod", "idempotencyKey", "trackingTokenHash"
            )
            SELECT ${makeGroupNumber()}::text, ${int(userId)}::int, ${input.customerName}::text,
                ${input.customerPhone}::text,
                (SELECT COALESCE(SUM(subtotal), 0)::int FROM totals),
                (SELECT COUNT(*)::int * ${fee}::int FROM totals), 0,
                (SELECT COALESCE(SUM(subtotal), 0)::int + COUNT(*)::int * ${fee}::int FROM totals),
                'COD', ${text(idempotencyKey)}::text, ${trackingTokenHash}::text
            RETURNING id
        ),
        ord AS (
            INSERT INTO "Order" (
                "orderNumber", "userId", "groupId", "sellerId", "customerName", "customerPhone",
                "upazila", "union", "ward", "address", "note", "subtotal", "deliveryFee", "discount", "total",
                "paymentMethod", "paymentStatus", "status"
            )
            SELECT ('AH-' || to_char(now(), 'YYYYMMDD') || '-' || floor(random() * 900000 + 100000)::text), ${int(userId)}::int, grp.id, totals."sellerId",
                ${input.customerName}::text, ${input.customerPhone}::text, ${input.upazila}::text,
                ${input.union}::text, ${int(input.ward)}::int, ${input.address}::text, ${text(input.note)}::text,
                totals.subtotal, ${fee}::int, 0, totals.subtotal + ${fee}::int, 'COD', 'PENDING', 'PENDING'
            FROM totals CROSS JOIN grp
            RETURNING id, "sellerId"
        ),
        items AS (
            INSERT INTO "OrderItem" ("orderId", "productId", "productName", "unitPrice", "quantity", "lineTotal")
            SELECT ord.id, u."productId", u."productName", u."unitPrice", u.quantity, u."unitPrice" * u.quantity
            FROM ord JOIN upd u ON u."sellerId" IS NOT DISTINCT FROM ord."sellerId"
            RETURNING id
        )
        SELECT id AS "groupId" FROM grp
    `;

    const first = rows[0];

    if (!first) {
        throw new Error("Order was not created");
    }

    return { groupId: Number(first.groupId), trackingToken };
};

const getGroupById = async (groupId: number, trackingToken?: string | null) => {
    const group = await db.orm.public.OrderGroup.where({ id: groupId }).select(
        "id", "groupNumber", "customerName", "customerPhone", "subtotal", "deliveryFee", "discount", "total", "paymentMethod", "createdAt"
    ).first();
    if (!group) throw new OrderError("ORDER_NOT_FOUND", "Order not found");
    const orders = await db.orm.public.Order.where({ groupId }).select(...ORDER_FIELDS).all();
    return {
        success: true as const,
        data: {
            ...group,
            orders: await Promise.all(orders.map(async (order) => ({
                ...order,
                sellerName: order.sellerId === null
                    ? "Amar Haat"
                    : (await db.orm.public.Seller.where({ id: order.sellerId }).select("shopName").first())?.shopName ?? "Seller",
                items: await getItems(order.id),
            }))),
            ...(trackingToken ? { trackingToken } : {}),
        },
    };
};

const createOrder = async (
    input: ValidatedOrder,
    userId: number | null,
    idempotencyKey: string | null = null
): Promise<CreatedOrder> => {
    // A repeat of an earlier request (double click, retry after a bad connection).
    if (idempotencyKey) {
        const existingId = await findGroupIdByKey(idempotencyKey);

        if (existingId !== null) {
            return { ...(await getGroupById(existingId, trackingTokenForAttempt(idempotencyKey))), replayed: true };
        }
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const { groupId, trackingToken } = await insertOrderAtomically(input, userId, idempotencyKey);

            return { ...(await getGroupById(groupId, trackingToken)), replayed: false };
        } catch (error) {
            const state = sqlState(error);

            // Not enough stock, or a product is inactive. Nothing was saved.
            if (state === DIVISION_BY_ZERO || state === CHECK_VIOLATION) {
                throw await explainShortage(input);
            }

            // Duplicate value: either the same Idempotency-Key arrived twice at the same moment,
            // or (rarely) the random order number already exists.
            if (state === UNIQUE_VIOLATION) {
                if (idempotencyKey) {
                    const existingId = await findGroupIdByKey(idempotencyKey);

                    if (existingId !== null) {
                        return { ...(await getGroupById(existingId, trackingTokenForAttempt(idempotencyKey))), replayed: true };
                    }
                }

                if (attempt < MAX_ATTEMPTS) continue; // try again with a new random order number
            }

            // The database asked us to try again (two orders locked each other's rows).
            if (
                (state === DEADLOCK || state === SERIALIZATION_FAILURE) &&
                attempt < MAX_ATTEMPTS
            ) {
                continue;
            }

            throw error;
        }
    }

    throw new Error("Could not create order");
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
    const group = await db.orm.public.OrderGroup
        .where({ groupNumber: orderNumber })
        .select("id", "groupNumber", "customerName", "customerPhone", "subtotal", "deliveryFee", "discount", "total", "paymentMethod", "createdAt")
        .first();

    if (group) {
        if (group.customerPhone !== normalizePhone(phone)) {
            throw new OrderError("ORDER_NOT_FOUND", "Order not found");
        }
        return getGroupById(group.id);
    }

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

const trackOrderByToken = async (token: string) => {
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
        throw new OrderError("ORDER_NOT_FOUND", "Order not found");
    }
    const rows = await query<{ id: number }>({ id: INT })`
        SELECT id FROM "OrderGroup" WHERE "trackingTokenHash" = ${hashTrackingToken(token)}::text LIMIT 1
    `;
    if (!rows[0]) throw new OrderError("ORDER_NOT_FOUND", "Order not found");
    return getGroupById(Number(rows[0].id));
};

// Admin: every order, newest first (no items, to keep the list light).
const getAllOrders = async () => {
    const orders = await db.orm.public.Order
        .select(...ORDER_FIELDS)
        .all();

    return { success: true, data: newestFirst(orders) };
};

// Changes the status and, for a cancellation, gives the stock back, in ONE statement.
// The status changes only if it is still what we read ("compare and set"), so two admins
// cancelling the same order at the same moment can never return the stock twice.
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

    const rows = await query<{ changed: number }>({ changed: INT })`
        WITH upd AS (
            UPDATE "Order"
            SET status = ${newStatus}::text, "updatedAt" = now()
            WHERE id = ${orderId}::int AND status = ${current}::text
            RETURNING id
        ),
        back AS (
            SELECT oi."productId", SUM(oi.quantity)::int AS qty
            FROM "OrderItem" oi
            JOIN upd ON oi."orderId" = upd.id
            WHERE ${newStatus}::text = 'CANCELLED' AND oi."productId" IS NOT NULL
            GROUP BY oi."productId"
        ),
        restock AS (
            UPDATE "Product" p
            SET stock = p.stock + b.qty, "updatedAt" = now()
            FROM back b
            WHERE p.id = b."productId"
            RETURNING p.id
        )
        SELECT (SELECT count(*) FROM upd)::int AS changed
    `;

    if (Number(rows[0]?.changed ?? 0) !== 1) {
        // Someone else changed the status between our read and our write.
        throw new OrderError(
            "INVALID_TRANSITION",
            "The order status was changed by someone else. Please reload and try again"
        );
    }

    return getOrderById(orderId);
};

export const orderService = {
    createOrder,
    getMyOrders,
    trackOrder,
    trackOrderByToken,
    getAllOrders,
    updateOrderStatus,
};
