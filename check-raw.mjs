// Run:  node check-raw.mjs
// Read-only. It runs the same steps as src/prisma/sql.ts and checks the database setup.
// If every line says PASS, the new order code is ready. If one says FAIL, send me the whole output.
import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import { param } from '@prisma/orm-postgres/relational-core/expression';
import contractJson from './src/prisma/contract.json' with { type: 'json' };

const db = postgres({ contractJson, url: process.env.DATABASE_URL });

const INT = 'pg/int4@1';
const TEXT = 'pg/text@1';

// Same shape as query() in src/prisma/sql.ts
const query = (spec) => async (strings, ...values) =>
    db.runtime().query(db.raw.sql(strings, ...values).returnsRow(spec).build()).toArray();

const report = (name, ok, detail = '') =>
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);

try {
    await db.connect();

    const n = 41;
    const r1 = await query({ answer: INT })`SELECT ${n}::int + 1 AS answer`;
    report('number parameter', Number(r1[0]?.answer) === 42, JSON.stringify(r1));

    const json = JSON.stringify([{ slug: 'a', qty: 2 }, { slug: 'a', qty: 3 }]);
    const r2 = await query({ slug: TEXT, qty: INT })`
    SELECT x.slug AS slug, SUM(x.qty)::int AS qty
    FROM jsonb_to_recordset(${json}::jsonb) AS x(slug text, qty int)
    GROUP BY x.slug`;
    report('JSON parameter to rows', Number(r2[0]?.qty) === 5, JSON.stringify(r2));

    const r3 = await query({ b: { codecId: INT, nullable: true } })`
    SELECT ${param(null, { codecId: INT })}::int AS b`;
    report('NULL parameter via param()', r3[0]?.b === null, JSON.stringify(r3));

    try {
        await query({ ok: INT })`SELECT 1 / CASE WHEN ${1}::int = 2 THEN 1 ELSE 0 END AS ok`;
        report('"not enough stock" alarm', false, 'no error was thrown');
    } catch (error) {
        report('"not enough stock" alarm exposes code 22012', error?.sqlState === '22012', `sqlState: ${error?.sqlState}`);
    }

    const r5 = await query({ column_name: TEXT })`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'Order' AND column_name = 'idempotencyKey'`;
    report('column "Order"."idempotencyKey" exists (sql/001 was run)', r5.length === 1);

    const r6 = await query({ conname: TEXT })`
    SELECT conname FROM pg_constraint WHERE conname = 'Product_stock_nonnegative'`;
    report('stock cannot go negative (constraint exists)', r6.length === 1);
} catch (error) {
    console.error('CHECK CRASHED');
    console.error(error);
    process.exitCode = 1;
} finally {
    await db.close();
}
