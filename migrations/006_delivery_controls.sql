-- Step 6: persistent, admin-controlled delivery methods.
-- Additive migration: existing product/order/rider data is untouched.
ALTER TABLE "Product"
    ADD COLUMN IF NOT EXISTS "deliveryMethods" text[] NOT NULL DEFAULT ARRAY['SELLER']::text[];

CREATE TABLE IF NOT EXISTS "DeliveryMethodSetting" (
    method text PRIMARY KEY CHECK (method IN ('PLATFORM_RIDER', 'SELLER', 'PICKUP')),
    enabled boolean NOT NULL DEFAULT true,
    fee integer NOT NULL DEFAULT 0 CHECK (fee >= 0),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "DeliveryMethodSetting" (method, enabled, fee) VALUES
    ('PLATFORM_RIDER', true, 0), ('SELLER', true, 0), ('PICKUP', true, 0)
ON CONFLICT (method) DO NOTHING;

CREATE INDEX IF NOT EXISTS "Delivery_riderId_status_idx" ON "Delivery" ("riderId", status);
