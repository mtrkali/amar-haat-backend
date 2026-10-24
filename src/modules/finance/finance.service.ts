import { db } from "../../prisma/db.js";
import { query, INT, TEXT, text } from "../../prisma/sql.js";
import { businessConfig } from "../../config/business.js";

export class FinanceError extends Error {
    constructor(public code: "SELLER_NOT_FOUND" | "COD_NOT_COLLECTIBLE" | "COMMISSION_NOT_SETTLEABLE", message: string) { super(message); this.name = "FinanceError"; }
}

const getAdminSummary = async () => {
    const [payments] = await query<{ pendingCod: number; collectedCod: number; paid: number; failed: number }>({ pendingCod: INT, collectedCod: INT, paid: INT, failed: INT })`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE method='COD' AND status='PENDING'),0)::int AS "pendingCod",
          COALESCE(SUM(amount) FILTER (WHERE method='COD' AND status='COLLECTED'),0)::int AS "collectedCod",
          COALESCE(SUM(amount) FILTER (WHERE status='PAID'),0)::int AS paid,
          COALESCE(SUM(amount) FILTER (WHERE status='FAILED'),0)::int AS failed
        FROM "Payment"
    `;
    const [commissions] = await query<{ pending: number; earned: number; settled: number; reversed: number }>({ pending: INT, earned: INT, settled: INT, reversed: INT })`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE status='PENDING'),0)::int AS pending,
          COALESCE(SUM(amount) FILTER (WHERE status='EARNED'),0)::int AS earned,
          COALESCE(SUM(amount) FILTER (WHERE status='SETTLED'),0)::int AS settled,
          COALESCE(SUM(amount) FILTER (WHERE status='REVERSED'),0)::int AS reversed
        FROM "CommissionRecord"
    `;
    const [sales] = await query<{ deliveredSales: number; deliveredDeliveryFees: number }>({ deliveredSales: INT, deliveredDeliveryFees: INT })`
        SELECT COALESCE(SUM(subtotal),0)::int AS "deliveredSales", COALESCE(SUM("deliveryFee"),0)::int AS "deliveredDeliveryFees" FROM "Order" WHERE status='DELIVERED'
    `;
    const pendingCodOrders = await query<{ id: number; orderNumber: string; customerName: string; customerPhone: string; amount: number }>({ id: INT, orderNumber: TEXT, customerName: TEXT, customerPhone: TEXT, amount: INT })`
        SELECT o.id, o."orderNumber", o."customerName", o."customerPhone", p.amount
        FROM "Payment" p JOIN "Order" o ON o.id=p."orderId"
        WHERE p.method='COD' AND p.status='PENDING' AND o.status='DELIVERED'
        ORDER BY o."updatedAt" DESC LIMIT 50
    `;
    const earnedCommissions = await query<{ id: number; orderNumber: string; shopName: string; basisAmount: number; rateBps: number; amount: number }>({ id: INT, orderNumber: TEXT, shopName: TEXT, basisAmount: INT, rateBps: INT, amount: INT })`
        SELECT c.id, o."orderNumber", s."shopName", c."basisAmount", c."rateBps", c.amount
        FROM "CommissionRecord" c JOIN "Order" o ON o.id=c."orderId" JOIN "Seller" s ON s.id=c."sellerId"
        WHERE c.status='EARNED' ORDER BY c."updatedAt" ASC LIMIT 50
    `;
    return { success: true, data: { ...payments, commissions, ...sales, pendingCodOrders, earnedCommissions, commissionPolicy: { defaultRateBps: businessConfig.commission.rateBps, basis: businessConfig.commission.basis } } };
};

const getSellerSummary = async (userId: number) => {
    const seller = await db.orm.public.Seller.where({ userId, status: "APPROVED" }).select("id").first();
    if (!seller) throw new FinanceError("SELLER_NOT_FOUND", "Approved seller shop not found");
    const [summary] = await query<{ deliveredSales: number; deliveredDeliveryFees: number; collectedCod: number; pendingCod: number; commissionPending: number; commissionEarned: number; commissionSettled: number; commissionReversed: number }>({ deliveredSales: INT, deliveredDeliveryFees: INT, collectedCod: INT, pendingCod: INT, commissionPending: INT, commissionEarned: INT, commissionSettled: INT, commissionReversed: INT })`
        SELECT
          COALESCE(SUM(o.subtotal) FILTER (WHERE o.status='DELIVERED'),0)::int AS "deliveredSales",
          COALESCE(SUM(o."deliveryFee") FILTER (WHERE o.status='DELIVERED'),0)::int AS "deliveredDeliveryFees",
          COALESCE(SUM(p.amount) FILTER (WHERE p.method='COD' AND p.status='COLLECTED'),0)::int AS "collectedCod",
          COALESCE(SUM(p.amount) FILTER (WHERE p.method='COD' AND p.status='PENDING'),0)::int AS "pendingCod",
          COALESCE(SUM(c.amount) FILTER (WHERE c.status='PENDING'),0)::int AS "commissionPending",
          COALESCE(SUM(c.amount) FILTER (WHERE c.status='EARNED'),0)::int AS "commissionEarned",
          COALESCE(SUM(c.amount) FILTER (WHERE c.status='SETTLED'),0)::int AS "commissionSettled",
          COALESCE(SUM(c.amount) FILTER (WHERE c.status='REVERSED'),0)::int AS "commissionReversed"
        FROM "Order" o
        LEFT JOIN "Payment" p ON p."orderId"=o.id
        LEFT JOIN "CommissionRecord" c ON c."orderId"=o.id
        WHERE o."sellerId"=${seller.id}::int
    `;
    const deliveredSales = summary?.deliveredSales ?? 0;
    return { success: true, data: { ...summary, sellerNetBeforeDeliveryFee: deliveredSales - (summary?.commissionEarned ?? 0) - (summary?.commissionSettled ?? 0) } };
};

const collectCod = async (orderId: number, actorUserId: number, reference: string | null) => {
    const rows = await query<{ orderId: number; amount: number }>({ orderId: INT, amount: INT })`
        WITH collected AS (
          UPDATE "Payment" p SET status='COLLECTED', "collectedAt"=now(), "collectedByUserId"=${actorUserId}::int, reference=${text(reference)}::text, "updatedAt"=now()
          FROM "Order" o
          WHERE p."orderId"=o.id AND o.id=${orderId}::int AND o.status='DELIVERED' AND p.method='COD' AND p.status='PENDING'
          RETURNING p."orderId", p.amount
        ), order_update AS (
          UPDATE "Order" o SET "paymentStatus"='COLLECTED', "updatedAt"=now() FROM collected WHERE o.id=collected."orderId" RETURNING o.id
        ), audit AS (
          INSERT INTO "AuditLog" ("actorUserId", "actorRole", action, "entityType", "entityId", details)
          SELECT ${actorUserId}::int, 'ADMIN', 'COD_PAYMENT_COLLECTED', 'Order', collected."orderId"::text,
                 json_build_object('amount', collected.amount, 'reference', ${text(reference)}::text)::text FROM collected RETURNING id
        )
        SELECT collected."orderId" AS "orderId", collected.amount FROM collected
        CROSS JOIN (SELECT count(*) FROM order_update) synced CROSS JOIN (SELECT count(*) FROM audit) logged
    `;
    if (!rows[0]) throw new FinanceError("COD_NOT_COLLECTIBLE", "COD can only be collected once, after delivery");
    return { success: true, data: rows[0] };
};

const settleCommission = async (commissionId: number, actorUserId: number, reference: string | null) => {
    const rows = await query<{ id: number; amount: number }>({ id: INT, amount: INT })`
        WITH settled AS (
          UPDATE "CommissionRecord" SET status='SETTLED', "updatedAt"=now()
          WHERE id=${commissionId}::int AND status='EARNED' RETURNING id, amount
        ), audit AS (
          INSERT INTO "AuditLog" ("actorUserId", "actorRole", action, "entityType", "entityId", details)
          SELECT ${actorUserId}::int, 'ADMIN', 'COMMISSION_SETTLED', 'CommissionRecord', settled.id::text,
                 json_build_object('amount', settled.amount, 'reference', ${text(reference)}::text)::text FROM settled RETURNING id
        )
        SELECT settled.id, settled.amount FROM settled CROSS JOIN (SELECT count(*) FROM audit) logged
    `;
    if (!rows[0]) throw new FinanceError("COMMISSION_NOT_SETTLEABLE", "Only earned commissions can be settled, and each settlement is recorded once");
    return { success: true, data: rows[0] };
};

export const financeService = { getAdminSummary, getSellerSummary, collectCod, settleCommission };
