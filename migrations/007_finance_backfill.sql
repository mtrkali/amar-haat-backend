-- Step 7: make older records visible in the COD and commission ledgers.
-- Safe to rerun. Step 2 creates these tables; this only inserts missing rows.
-- Historical orders have no saved global commission policy, so sellers without an
-- explicit commissionBps are backfilled at 0% rather than inventing past charges.

CREATE TABLE IF NOT EXISTS "Payment" (
    id serial PRIMARY KEY,
    "orderId" integer NOT NULL REFERENCES "Order"(id) ON DELETE CASCADE,
    method text NOT NULL DEFAULT 'COD' CHECK (method IN ('COD')),
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COLLECTED', 'PAID', 'FAILED', 'REFUNDED')),
    amount integer NOT NULL CHECK (amount >= 0),
    "collectedAt" timestamptz,
    "collectedByUserId" integer,
    reference text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CommissionRecord" (
    id serial PRIMARY KEY,
    "orderId" integer NOT NULL UNIQUE REFERENCES "Order"(id) ON DELETE CASCADE,
    "sellerId" integer NOT NULL REFERENCES "Seller"(id) ON DELETE CASCADE,
    "basisAmount" integer NOT NULL CHECK ("basisAmount" >= 0),
    "rateBps" integer NOT NULL CHECK ("rateBps" BETWEEN 0 AND 10000),
    amount integer NOT NULL CHECK (amount >= 0),
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'EARNED', 'SETTLED', 'REVERSED')),
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Payment_orderId_step7_idx" ON "Payment" ("orderId");
CREATE INDEX IF NOT EXISTS "Payment_status_method_step7_idx" ON "Payment" (status, method);
CREATE INDEX IF NOT EXISTS "CommissionRecord_sellerId_status_step7_idx" ON "CommissionRecord" ("sellerId", status);

INSERT INTO "Payment" ("orderId", method, status, amount, "collectedAt", "updatedAt")
SELECT o.id, o."paymentMethod", o."paymentStatus", o.total,
       CASE WHEN o."paymentStatus" IN ('COLLECTED', 'PAID') THEN o."updatedAt" ELSE NULL END,
       now()
FROM "Order" o
WHERE NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId"=o.id);

INSERT INTO "CommissionRecord" ("orderId", "sellerId", "basisAmount", "rateBps", amount, status, "updatedAt")
SELECT o.id, s.id, o.subtotal, COALESCE(s."commissionBps", 0),
       ROUND(o.subtotal::numeric * COALESCE(s."commissionBps", 0)::numeric / 10000)::int,
       CASE WHEN o.status='DELIVERED' THEN 'EARNED' WHEN o.status IN ('CANCELLED', 'REJECTED') THEN 'REVERSED' ELSE 'PENDING' END,
       now()
FROM "Order" o
JOIN "Seller" s ON s.id=o."sellerId"
WHERE NOT EXISTS (SELECT 1 FROM "CommissionRecord" c WHERE c."orderId"=o.id);
