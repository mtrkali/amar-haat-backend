import type { Request, Response } from "express";
import { contentService, ContentError } from "./content.service.js";
import type { FaqInput, TestimonialInput } from "./content.service.js";
import { validateFields, FAQ_RULES, TESTIMONIAL_RULES } from "./content.validation.js";

const sendContentError = (error: unknown, res: Response, fallback: string) => {
    if (error instanceof ContentError) {
        return res.status(404).json({ success: false, code: error.code, message: error.message });
    }

    console.error(fallback, error);

    return res.status(500).json({ success: false, message: fallback });
};

const readId = (req: Request): number | null => {
    const id = Number(req.params["id"]);

    return Number.isInteger(id) && id >= 1 ? id : null;
};

const badInput = (res: Response, errors: Record<string, string>) =>
    res.status(400).json({ success: false, message: "Please check the details", errors });

// ---------- FAQ ----------

const listFaqs = async (_req: Request, res: Response) => {
    try {
        return res.status(200).json(await contentService.listFaqs(false));
    } catch (error) {
        return sendContentError(error, res, "Failed to fetch FAQs");
    }
};

const listAllFaqs = async (_req: Request, res: Response) => {
    try {
        return res.status(200).json(await contentService.listFaqs(true));
    } catch (error) {
        return sendContentError(error, res, "Failed to fetch FAQs");
    }
};

const createFaq = async (req: Request, res: Response) => {
    const check = validateFields(req.body, FAQ_RULES, "create");

    if (!check.ok) return badInput(res, check.errors);

    try {
        const result = await contentService.createFaq(check.value as FaqInput);

        return res.status(201).json({ ...result, message: "FAQ created" });
    } catch (error) {
        return sendContentError(error, res, "Failed to create FAQ");
    }
};

const updateFaq = async (req: Request, res: Response) => {
    const id = readId(req);

    if (id === null) {
        return res.status(400).json({ success: false, message: "Invalid FAQ id" });
    }

    const check = validateFields(req.body, FAQ_RULES, "update");

    if (!check.ok) return badInput(res, check.errors);

    try {
        const result = await contentService.updateFaq(id, check.value as FaqInput);

        return res.status(200).json({ ...result, message: "FAQ updated" });
    } catch (error) {
        return sendContentError(error, res, "Failed to update FAQ");
    }
};

// ---------- Testimonials ----------

const listTestimonials = async (_req: Request, res: Response) => {
    try {
        return res.status(200).json(await contentService.listTestimonials(false));
    } catch (error) {
        return sendContentError(error, res, "Failed to fetch testimonials");
    }
};

const listAllTestimonials = async (_req: Request, res: Response) => {
    try {
        return res.status(200).json(await contentService.listTestimonials(true));
    } catch (error) {
        return sendContentError(error, res, "Failed to fetch testimonials");
    }
};

const createTestimonial = async (req: Request, res: Response) => {
    const check = validateFields(req.body, TESTIMONIAL_RULES, "create");

    if (!check.ok) return badInput(res, check.errors);

    try {
        const result = await contentService.createTestimonial(check.value as TestimonialInput);

        return res.status(201).json({ ...result, message: "Testimonial created" });
    } catch (error) {
        return sendContentError(error, res, "Failed to create testimonial");
    }
};

const updateTestimonial = async (req: Request, res: Response) => {
    const id = readId(req);

    if (id === null) {
        return res.status(400).json({ success: false, message: "Invalid testimonial id" });
    }

    const check = validateFields(req.body, TESTIMONIAL_RULES, "update");

    if (!check.ok) return badInput(res, check.errors);

    try {
        const result = await contentService.updateTestimonial(id, check.value as TestimonialInput);

        return res.status(200).json({ ...result, message: "Testimonial updated" });
    } catch (error) {
        return sendContentError(error, res, "Failed to update testimonial");
    }
};

export const contentController = {
    listFaqs,
    listAllFaqs,
    createFaq,
    updateFaq,
    listTestimonials,
    listAllTestimonials,
    createTestimonial,
    updateTestimonial,
};