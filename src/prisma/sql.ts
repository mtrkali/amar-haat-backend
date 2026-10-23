import { param } from "@prisma/orm-postgres/relational-core/expression";
import { db } from "./db.js";

// One small place for raw SQL. The order code needs single-statement queries
// (so stock and order are saved together or not at all), and the ORM query
// builder cannot express that. If the Prisma 8 raw API changes, only this file changes.
//
// How it works in this Prisma 8 client (verified against the real package):
//   db.raw.sql`...`            builds a statement; values become bound parameters
//   .returnsRow({ col: codec }) says which columns come back, and their codec
//   .build()                    makes the plan
//   db.runtime().query(plan)    runs it; .toArray() gives the rows
//
// Usage:
//   const rows = await query<{ id: number }>({ id: INT })`SELECT id FROM "Order" WHERE id = ${orderId}`;

export type SqlRow = Record<string, unknown>;

export type RowSpec = Record<string, string | { codecId: string; nullable?: boolean }>;

// Codec ids for the columns we read back.
export const INT = "pg/int4@1";
export const TEXT = "pg/text@1";

// Bare JS numbers and strings can be sent as they are. A null cannot: the client cannot guess
// its type, so it must be wrapped with an explicit codec. Use these for values that may be null.
export const int = (value: number | null | undefined) =>
    value === null || value === undefined ? param(null, { codecId: INT }) : value;

export const text = (value: string | null | undefined) =>
    value === null || value === undefined ? param(null, { codecId: TEXT }) : value;

let connecting: Promise<void> | null = null;

// The client needs an open connection. Ask once; ignore "already connected".
const ensureConnected = (): Promise<void> => {
    connecting ??= (async () => {
        try {
            await (db as any).connect();
        } catch {
            // Already connected. A real problem will show in the query below with its own message.
        }
    })();

    return connecting;
};

export const query =
    <T extends SqlRow = SqlRow>(spec: RowSpec) =>
        async (strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
            await ensureConnected();

            const client = db as any;
            const plan = client.raw.sql(strings, ...values).returnsRow(spec).build();

            return (await client.runtime().query(plan).toArray()) as T[];
        };

// The 5-character PostgreSQL error code, for example "23505" (duplicate value).
// This client puts it on error.sqlState.
export const sqlState = (error: unknown): string | undefined => {
    const read = (value: unknown): string | undefined => {
        if (typeof value !== "object" || value === null) return undefined;

        const e = value as { sqlState?: unknown; code?: unknown };

        if (typeof e.sqlState === "string") return e.sqlState;
        if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;

        return undefined;
    };

    return read(error) ?? read((error as { cause?: unknown } | null)?.cause);
};