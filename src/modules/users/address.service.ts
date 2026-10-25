import { db } from "../../prisma/db.js";
import { query, INT } from "../../prisma/sql.js";

export type AddressInput = { label: string | null; name: string; phone: string; upazila: string; union: string; ward: number | null; address: string; note: string | null; isDefault: boolean };

const addressFields = ["id", "label", "name", "phone", "upazila", "union", "ward", "address", "note", "isDefault", "createdAt", "updatedAt"] as const;

const list = async (userId: number) => ({ success: true, data: await db.orm.public.Address.where({ userId }).select(...addressFields).all() });

const save = async (userId: number, input: AddressInput, id?: number) => {
    if (id !== undefined) {
        const existing = await db.orm.public.Address.where({ id, userId }).select("id").first();
        if (!existing) throw new Error("ADDRESS_NOT_FOUND");
    }
    if (input.isDefault) {
        await query({ id: INT })`UPDATE "Address" SET "isDefault"=false, "updatedAt"=now() WHERE "userId"=${userId}::int`;
    }
    const now = new Date().toISOString();
    const values = { ...input, userId, updatedAt: now };
    const row = id === undefined
        ? await (db.orm.public.Address as any).create({ ...values, createdAt: now })
        : await db.orm.public.Address.where({ id, userId }).select(...addressFields).update(values as any);
    return { success: true, data: row };
};

const remove = async (userId: number, id: number) => {
    const found = await db.orm.public.Address.where({ id, userId }).select("id").first();
    if (!found) throw new Error("ADDRESS_NOT_FOUND");
    await query({ id: INT })`DELETE FROM "Address" WHERE id=${id}::int AND "userId"=${userId}::int RETURNING id`;
    return { success: true };
};

const setDefault = async (userId: number, id: number) => {
    const rows = await query<{ id: number }>({ id: INT })`
        WITH target AS (SELECT id FROM "Address" WHERE id=${id}::int AND "userId"=${userId}::int),
        clear AS (UPDATE "Address" SET "isDefault"=false, "updatedAt"=now() WHERE "userId"=${userId}::int AND EXISTS(SELECT 1 FROM target))
        UPDATE "Address" SET "isDefault"=true, "updatedAt"=now() WHERE id IN (SELECT id FROM target) RETURNING id
    `;
    if (!rows[0]) throw new Error("ADDRESS_NOT_FOUND");
    return { success: true, data: await db.orm.public.Address.where({ id, userId }).select(...addressFields).first() };
};

export const addressService = { list, save, remove, setDefault };
