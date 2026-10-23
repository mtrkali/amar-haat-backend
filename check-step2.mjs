// Run AFTER sql/002_step2_schema.sql and `npx prisma contract emit`:   node check-step2.mjs
// Read-only. Checks the new tables, the old orders' backfill, and that the ORM can see the new tables.
// If one line says FAIL, send me the whole output.
import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import contractJson from './src/prisma/contract.json' with { type: 'json' };

const db = postgres({ contractJson, url: process.env.DATABASE_URL });

const INT = 'pg/int4@1';
const TEXT = 'pg/text@1';

const query = (spec) => async (strings, ...values) =>
    db.runtime().query(db.raw.sql(strings, ...values).returnsRow(spec).build()).toArray();

const report = (name, ok, detail = '') =>
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);

const TABLES = ['OrderGroup', 'OrderStatusHistory', 'Payment', 'CommissionRecord', 'RiderProfile', 'Delivery', 'Address', 'AuditLog'];

try {
    await db.connect();

    // 1. New tables
    const found = await query({ table_name: TEXT })`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    const names = new Set(found.map((r) => r.table_name));
    for (const table of TABLES) report(`table "${table}" exists`, names.has(table));

    // 2. New columns: checked by name, so a missing one is named in the output
    const expected = [
        ['Order', 'groupId'], ['Order', 'sellerId'], ['Order', 'discount'], ['Order', 'paymentStatus'],
        ['Seller', 'phone'], ['Seller', 'address'], ['Seller', 'description'], ['Seller', 'commissionBps'],
        ['Category', 'description'], ['Category', 'parentId'],
    ];
    const cols = await query({ table_name: TEXT, column_name: TEXT })`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('Order', 'Seller', 'Category')`;
    const have = new Set(cols.map((r) => `${r.table_name}.${r.column_name}`));
    for (const [table, column] of expected) report(`column ${table}.${column} exists`, have.has(`${table}.${column}`));

    // 3. The status check knows the new statuses
    const check = await query({ def: TEXT })`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = '"Order"'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%OUT_FOR_DELIVERY%'`;
    report('Order status check allows PROCESSING and REJECTED',
        check.length === 1 && check[0].def.includes('PROCESSING') && check[0].def.includes('REJECTED'));

    // 4. Old orders were brought into the new structure
    const [noGroup] = await query({ n: INT })`SELECT count(*)::int AS n FROM "Order" WHERE "groupId" IS NULL`;
    const [noHistory] = await query({ n: INT })`
    SELECT count(*)::int AS n FROM "Order" o WHERE NOT EXISTS (SELECT 1 FROM "OrderStatusHistory" h WHERE h."orderId" = o.id)`;
    const [noPayment] = await query({ n: INT })`
    SELECT count(*)::int AS n FROM "Order" o WHERE NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = o.id)`;
    const [orders] = await query({ n: INT })`SELECT count(*)::int AS n FROM "Order"`;

    report('every order has a group', noGroup.n === 0, `${noGroup.n} without, of ${orders.n}`);
    report('every order has a status history', noHistory.n === 0, `${noHistory.n} without`);
    report('every order has a payment record', noPayment.n === 0, `${noPayment.n} without`);

    // 5. The ORM (after `prisma contract emit`) can read the new tables
    for (const model of ['OrderGroup', 'OrderStatusHistory', 'Payment', 'CommissionRecord', 'RiderProfile', 'Delivery', 'Address', 'AuditLog']) {
        try {
            const rows = await db.orm.public[model].select('id').all();
            report(`ORM can read ${model}`, Array.isArray(rows), `${rows.length} rows`);
        } catch (error) {
            report(`ORM can read ${model}`, false, String(error?.message).slice(0, 160) + '  (did you run: npx prisma contract emit ?)');
        }
    }
} catch (error) {
    console.error('CHECK CRASHED');
    console.error(error);
    process.exitCode = 1;
} finally {
    await db.close();
}
