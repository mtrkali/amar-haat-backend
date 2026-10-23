// Proof that the new order code is safe when many people order at the same moment.
//
// It WRITES test data (one test product, a few test orders) and deletes it again at the end.
// Use a development database, not live customer data. To confirm, run:
//
//   CONFIRM_TEST=yes npx tsx scripts/check-order-race.ts
//
// Expected result: every line says PASS.
import "dotenv/config";
import { orderService, OrderError } from "../src/modules/orders/order.service.js";
import { query, INT } from "../src/prisma/sql.js";

const done = query({ n: INT }); // for statements: they end with RETURNING 1 AS n
import type { ValidatedOrder } from "../src/modules/orders/order.validation.js";

if (process.env["CONFIRM_TEST"] !== "yes") {
    console.error("Refusing to run. This script writes test data. Set CONFIRM_TEST=yes to continue.");
    process.exit(1);
}

let failures = 0;

const check = (name: string, ok: boolean, detail = "") => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

const slug = `zz-race-test-${Date.now()}`;

const orderFor = (quantity: number): ValidatedOrder => ({
    customerName: "Race Test",
    customerPhone: "01712345678",
    upazila: "ফেনী সদর",
    union: "টেস্ট",
    ward: null,
    address: "Race test address, please ignore",
    note: null,
    items: [{ productSlug: slug, quantity }],
});

const stockNow = async (): Promise<number> => {
    const rows = await query<{ stock: number }>({ stock: INT })`SELECT stock FROM "Product" WHERE slug = ${slug}::text`;

    return Number(rows[0]?.stock);
};

const keyOf = (label: string, i: number) => `race-${label}-${Date.now()}-${i}-abcdefghij`;

const cleanup = async () => {
    await done`DELETE FROM "OrderItem" WHERE "orderId" IN (
        SELECT o.id FROM "Order" o WHERE o."customerName" = 'Race Test') RETURNING 1 AS n`;
    await done`DELETE FROM "Order" WHERE "customerName" = 'Race Test' RETURNING 1 AS n`;
    await done`DELETE FROM "Product" WHERE slug = ${slug}::text RETURNING 1 AS n`;
};

try {
    const category = (await query<{ id: number }>({ id: INT })`SELECT id FROM "Category" ORDER BY id LIMIT 1`)[0];

    if (!category) throw new Error("Create at least one category first (run the seed).");

    await done`INSERT INTO "Product" (slug, name, "categoryId", price, stock, "isActive")
              VALUES (${slug}::text, 'Race Test Product', ${Number(category.id)}::int, 100, 3, true) RETURNING 1 AS n`;

    // 1. Eight customers want the last 3 items at the same moment.
    const results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
            orderService.createOrder(orderFor(1), null, keyOf("a", i))
        )
    );

    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter(
        (r) => r.status === "rejected" && r.reason instanceof OrderError && r.reason.code === "OUT_OF_STOCK"
    );
    const stockAfterRace = await stockNow();

    check("exactly 3 of 8 simultaneous orders succeed", won.length === 3, `succeeded: ${won.length}`);
    check("the other 5 get a clean OUT_OF_STOCK", lost.length === 5, `out of stock: ${lost.length}`);
    check("stock ends at exactly 0, never negative", stockAfterRace === 0, `stock: ${stockAfterRace}`);

    // 2. A multi-item order where one item is short must save nothing at all.
    await done`UPDATE "Product" SET stock = 5 WHERE slug = ${slug}::text RETURNING 1 AS n`;

    let rejected = false;

    try {
        await orderService.createOrder(orderFor(6), null, keyOf("b", 0));
    } catch (error) {
        rejected = error instanceof OrderError && error.code === "OUT_OF_STOCK";
    }

    check("an order for more than the stock is refused", rejected);
    check("a refused order leaves the stock untouched", (await stockNow()) === 5, `stock: ${await stockNow()}`);

    // 3. The same Idempotency-Key sent 5 times at once makes ONE order.
    const sameKey = keyOf("c", 0);
    const repeats = await Promise.allSettled(
        Array.from({ length: 5 }, () => orderService.createOrder(orderFor(1), null, sameKey))
    );
    const ids = new Set(
        repeats.flatMap((r) => (r.status === "fulfilled" ? [r.value.data.id] : []))
    );

    check("5 identical requests all answer successfully", repeats.every((r) => r.status === "fulfilled"));
    check("...and they all point to the same single order", ids.size === 1, `distinct orders: ${ids.size}`);
    check("...and stock dropped by 1 only", (await stockNow()) === 4, `stock: ${await stockNow()}`);

    // 4. Two admins cancel the same order at the same moment: stock comes back once.
    const orderId = [...ids][0] as number;
    const cancels = await Promise.allSettled([
        orderService.updateOrderStatus(orderId, "CANCELLED"),
        orderService.updateOrderStatus(orderId, "CANCELLED"),
    ]);

    check(
        "exactly one of two simultaneous cancels succeeds",
        cancels.filter((r) => r.status === "fulfilled").length === 1
    );
    check("stock returned exactly once", (await stockNow()) === 5, `stock: ${await stockNow()}`);
} catch (error) {
    failures++;
    console.error("TEST CRASHED", error);
} finally {
    try {
        await cleanup();
        console.log("Test data removed.");
    } catch (error) {
        console.error("Could not remove test data. Delete rows where customerName = 'Race Test' and slug starts with zz-race-test-.", error);
    }
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);   