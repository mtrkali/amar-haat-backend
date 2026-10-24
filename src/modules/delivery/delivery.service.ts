import { db } from "../../prisma/db.js";
import { query, INT, TEXT } from "../../prisma/sql.js";

export const METHODS = ["PLATFORM_RIDER", "SELLER", "PICKUP"] as const;
export type DeliveryMethod = (typeof METHODS)[number];
export type DeliveryStatus = "ASSIGNED" | "ACCEPTED" | "PICKED_UP" | "DELIVERED" | "FAILED";

const getMethods = async () => {
    const data = await query<{ method: string; enabled: boolean; fee: number }>({ method: TEXT, enabled: "pg/bool@1", fee: INT })`
        SELECT method, enabled, fee FROM "DeliveryMethodSetting" ORDER BY method
    `;
    return { success: true, data };
};

const getProductOptions = async (slugs: string[]) => {
    const wanted = JSON.stringify([...new Set(slugs)].slice(0, 50));
    const products = await query<{ slug: string; sellerId: number | null; deliveryMethods: string }>({ slug: TEXT, sellerId: { codecId: INT, nullable: true }, deliveryMethods: TEXT })`
        SELECT p.slug, p."sellerId", array_to_json(p."deliveryMethods")::text AS "deliveryMethods" FROM "Product" p
        JOIN jsonb_array_elements_text(${wanted}::jsonb) AS req(value) ON req.value=p.slug WHERE p."isActive"=true
    `;
    const settings = await getMethods();
    return { success: true, data: { methods: settings.data.filter((m) => m.enabled), products: products.map(({ deliveryMethods, ...product }) => ({ ...product, deliveryMethods: JSON.parse(deliveryMethods) as string[] })) } };
};

const setProductMethods = async (userId: number, productId: number, methods: DeliveryMethod[]) => {
    const seller = await db.orm.public.Seller.where({ userId, status: "APPROVED" }).select("id").first();
    if (!seller) return null;
    const rows = await query<{ id: number }>({ id: INT })`
        UPDATE "Product" SET "deliveryMethods"=ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(methods)}::jsonb)), "updatedAt"=now() WHERE id=${productId}::int AND "sellerId"=${seller.id}::int RETURNING id
    `;
    return rows[0] ? { success: true, data: { id: productId, methods } } : null;
};

const saveMethods = async (rows: Array<{ method: DeliveryMethod; enabled: boolean; fee: number }>) => {
    for (const row of rows) await query({ id: INT })`
        INSERT INTO "DeliveryMethodSetting" (method, enabled, fee, "updatedAt") VALUES (${row.method}::text, ${row.enabled}::boolean, ${row.fee}::int, now())
        ON CONFLICT (method) DO UPDATE SET enabled=EXCLUDED.enabled, fee=EXCLUDED.fee, "updatedAt"=now() RETURNING 1 AS id
    `;
    return getMethods();
};

const listRiders = async () => {
    const data = await query<{ id: number; userId: number; name: string; phone: string; verificationStatus: string; isAvailable: boolean }>({ id: INT, userId: INT, name: TEXT, phone: TEXT, verificationStatus: TEXT, isAvailable: "pg/bool@1" })`
        SELECT r.id, r."userId", u.name, u.phone, r."verificationStatus", r."isAvailable" FROM "RiderProfile" r JOIN "User" u ON u.id=r."userId" ORDER BY u.name
    `;
    return { success: true, data };
};

const registerRider = async (userId: number) => {
    const result = await query<{ id: number }>({ id: INT })`
        WITH u AS (UPDATE "User" SET role='RIDER', "updatedAt"=now() WHERE id=${userId}::int AND role IN ('CUSTOMER','RIDER') RETURNING id),
        r AS (INSERT INTO "RiderProfile" ("userId", "verificationStatus", "isAvailable", "updatedAt") SELECT id, 'PENDING', false, now() FROM u ON CONFLICT ("userId") DO UPDATE SET "updatedAt"=now() RETURNING id)
        SELECT id FROM r
    `;
    return result[0] ? { success: true, data: result[0] } : null;
};

const setVerification = async (riderId: number, status: "PENDING" | "VERIFIED" | "REJECTED") => {
    const result = await query<{ id: number }>({ id: INT })`
        UPDATE "RiderProfile" SET "verificationStatus"=${status}::text, "isAvailable"=CASE WHEN ${status}::text='VERIFIED' THEN "isAvailable" ELSE false END, "updatedAt"=now() WHERE id=${riderId}::int RETURNING id
    `;
    return result[0] ? { success: true, data: result[0] } : null;
};

const assign = async (orderId: number, riderId: number) => {
    const rows = await query<{ id: number }>({ id: INT })`
        WITH ok AS (SELECT r.id FROM "RiderProfile" r JOIN "DeliveryMethodSetting" s ON s.method='PLATFORM_RIDER' AND s.enabled=true JOIN "Order" o ON o.id=${orderId}::int AND o.status NOT IN ('DELIVERED','CANCELLED','REJECTED') JOIN "Delivery" old ON old."orderId"=o.id AND old.method='PLATFORM_RIDER' AND old.status IN ('PENDING','ASSIGNED','FAILED') WHERE r.id=${riderId}::int AND r."verificationStatus"='VERIFIED' AND r."isAvailable"=true),
        d AS (UPDATE "Delivery" old SET status='ASSIGNED', "riderId"=ok.id, "assignedAt"=now(), "updatedAt"=now() FROM ok WHERE old."orderId"=${orderId}::int RETURNING old.id)
        SELECT id FROM d
    `;
    return rows[0] ? { success: true, data: rows[0] } : null;
};

const riderDashboard = async (userId: number) => {
    const rows = await query<{ riderId: number; verificationStatus: string; isAvailable: boolean }>({ riderId: INT, verificationStatus: TEXT, isAvailable: "pg/bool@1" })`
        SELECT id AS "riderId", "verificationStatus", "isAvailable" FROM "RiderProfile" WHERE "userId"=${userId}::int
    `;
    const rider = rows[0];
    if (!rider || rider.verificationStatus !== "VERIFIED") return null;
    const deliveries = await query<Record<string, unknown>>({ id: INT, orderId: INT, orderNumber: TEXT, status: TEXT, customerName: TEXT, customerPhone: TEXT, upazila: TEXT, union: TEXT, address: TEXT, total: INT })`
        SELECT d.id, o.id AS "orderId", o."orderNumber", d.status, o."customerName", o."customerPhone", o.upazila, o."union", o.address, o.total FROM "Delivery" d JOIN "Order" o ON o.id=d."orderId" WHERE d."riderId"=${rider.riderId}::int ORDER BY d."updatedAt" DESC
    `;
    return { success: true, data: { rider, deliveries } };
};

const setAvailability = async (userId: number, available: boolean) => {
    const rows = await query<{ id: number }>({ id: INT })`
        UPDATE "RiderProfile" SET "isAvailable"=${available}::boolean, "updatedAt"=now() WHERE "userId"=${userId}::int AND "verificationStatus"='VERIFIED' RETURNING id
    `;
    return rows[0] ? { success: true } : null;
};

const setDeliveryStatus = async (userId: number, deliveryId: number, status: DeliveryStatus) => {
    const allowed: Record<DeliveryStatus, string[]> = { ASSIGNED: [], ACCEPTED: ["ASSIGNED"], PICKED_UP: ["ACCEPTED"], DELIVERED: ["PICKED_UP"], FAILED: ["ASSIGNED", "ACCEPTED", "PICKED_UP"] };
    const rows = await query<{ id: number }>({ id: INT })`
        WITH changed AS (
            UPDATE "Delivery" d SET status=${status}::text, "pickedUpAt"=CASE WHEN ${status}::text='PICKED_UP' THEN now() ELSE d."pickedUpAt" END, "deliveredAt"=CASE WHEN ${status}::text='DELIVERED' THEN now() ELSE d."deliveredAt" END, "updatedAt"=now()
            FROM "RiderProfile" r WHERE d.id=${deliveryId}::int AND r."userId"=${userId}::int AND r."verificationStatus"='VERIFIED' AND d."riderId"=r.id AND d.status=ANY(ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(allowed[status])}::jsonb))) RETURNING d.id, d."orderId"
        ), ord AS (
            UPDATE "Order" o SET status=CASE WHEN ${status}::text='PICKED_UP' THEN 'OUT_FOR_DELIVERY' WHEN ${status}::text='DELIVERED' THEN 'DELIVERED' ELSE o.status END, "updatedAt"=now()
            FROM changed WHERE o.id=changed."orderId" AND ${status}::text IN ('PICKED_UP','DELIVERED') RETURNING o.id
        ), commission_update AS (
            UPDATE "CommissionRecord" c SET status='EARNED', "updatedAt"=now()
            FROM ord WHERE c."orderId"=ord.id AND ${status}::text='DELIVERED' AND c.status='PENDING' RETURNING c.id
        ) SELECT id FROM changed
    `;
    return rows[0] ? { success: true } : null;
};

export const deliveryService = { getMethods, getProductOptions, setProductMethods, saveMethods, listRiders, registerRider, setVerification, assign, riderDashboard, setAvailability, setDeliveryStatus };
