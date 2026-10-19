import { db } from "../../prisma/db.js";

export class ContentError extends Error {
    constructor(public code: "NOT_FOUND", message: string) {
        super(message);
        this.name = "ContentError";
    }
}

export type FaqInput = {
    question?: string;
    answer?: string;
    sortOrder?: number;
    isActive?: boolean;
};

export type TestimonialInput = {
    name?: string;
    area?: string;
    rating?: number;
    quote?: string;
    sortOrder?: number;
    isActive?: boolean;
};

const bySortOrder = <T extends { sortOrder: number }>(rows: T[]): T[] =>
    [...rows].sort((a, b) => a.sortOrder - b.sortOrder);

const FAQ_FIELDS = ["id", "question", "answer", "sortOrder", "isActive"] as const;

const TESTIMONIAL_FIELDS = [
    "id",
    "name",
    "area",
    "rating",
    "quote",
    "sortOrder",
    "isActive",
] as const;

// ---------- FAQ ----------

const listFaqs = async (includeHidden: boolean) => {
    const rows = await db.orm.public.Faq.select(...FAQ_FIELDS).all();
    const shown = includeHidden ? rows : rows.filter((row) => row.isActive);

    return {
        success: true,
        data: bySortOrder(shown).map(({ sortOrder: _s, isActive: _a, ...row }) =>
            includeHidden ? { ...row, sortOrder: _s, isActive: _a } : row
        ),
    };
};

const createFaq = async (input: FaqInput) => {
    const created = await (db.orm.public.Faq as any).create({
        question: input.question,
        answer: input.answer,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
    });

    return getFaq(created.id);
};

const getFaq = async (id: number) => {
    const faq = await db.orm.public.Faq
        .where({ id })
        .select(...FAQ_FIELDS)
        .first();

    if (!faq) {
        throw new ContentError("NOT_FOUND", "FAQ not found");
    }

    return { success: true, data: faq };
};

const updateFaq = async (id: number, input: FaqInput) => {
    await getFaq(id);

    const updateData = {
        ...(input.question !== undefined && { question: input.question }),
        ...(input.answer !== undefined && { answer: input.answer }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
    };

    await db.orm.public.Faq
        .where({ id })
        .select("id")
        .update(updateData);

    return getFaq(id);
};

// ---------- Testimonials ----------

const listTestimonials = async (includeHidden: boolean) => {
    const rows = await db.orm.public.Testimonial
        .select(...TESTIMONIAL_FIELDS)
        .all();
    const shown = includeHidden ? rows : rows.filter((row) => row.isActive);

    return {
        success: true,
        data: bySortOrder(shown).map(({ sortOrder: _s, isActive: _a, ...row }) =>
            includeHidden ? { ...row, sortOrder: _s, isActive: _a } : row
        ),
    };
};

const getTestimonial = async (id: number) => {
    const row = await db.orm.public.Testimonial
        .where({ id })
        .select(...TESTIMONIAL_FIELDS)
        .first();

    if (!row) {
        throw new ContentError("NOT_FOUND", "Testimonial not found");
    }

    return { success: true, data: row };
};

const createTestimonial = async (input: TestimonialInput) => {
    const created = await (db.orm.public.Testimonial as any).create({
        name: input.name,
        area: input.area,
        rating: input.rating,
        quote: input.quote,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        createdAt: new Date().toISOString(),
    });

    return getTestimonial(created.id);
};

const updateTestimonial = async (id: number, input: TestimonialInput) => {
    await getTestimonial(id);

    const updateData = {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.area !== undefined && { area: input.area }),
        ...(input.rating !== undefined && { rating: input.rating }),
        ...(input.quote !== undefined && { quote: input.quote }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
    };

    await db.orm.public.Testimonial
        .where({ id })
        .select("id")
        .update(updateData);

    return getTestimonial(id);
};

export const contentService = {
    listFaqs,
    createFaq,
    updateFaq,
    listTestimonials,
    createTestimonial,
    updateTestimonial,
};