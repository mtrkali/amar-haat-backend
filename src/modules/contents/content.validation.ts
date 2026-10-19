// Small field checker shared by the FAQ and testimonial routes.

type Rule =
    | { type: "string"; min: number; max: number; required?: boolean }
    | { type: "int"; min: number; max: number; required?: boolean }
    | { type: "boolean"; required?: boolean };

export type FieldResult =
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; errors: Record<string, string> };

export const validateFields = (
    body: unknown,
    rules: Record<string, Rule>,
    mode: "create" | "update"
): FieldResult => {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return { ok: false, errors: { body: "Request body is required." } };
    }

    const input = body as Record<string, unknown>;
    const errors: Record<string, string> = {};
    const value: Record<string, unknown> = {};

    for (const [key, rule] of Object.entries(rules)) {
        const raw = input[key];

        if (raw === undefined) {
            if (mode === "create" && rule.required) {
                errors[key] = `${key} is required.`;
            }
            continue;
        }

        if (rule.type === "string") {
            const text = typeof raw === "string" ? raw.trim().replace(/[ \t]+/g, " ") : "";

            if (text.length < rule.min || text.length > rule.max) {
                errors[key] = `${key} must be ${rule.min} to ${rule.max} characters.`;
            } else {
                value[key] = text;
            }
        } else if (rule.type === "int") {
            if (typeof raw === "number" && Number.isInteger(raw) && raw >= rule.min && raw <= rule.max) {
                value[key] = raw;
            } else {
                errors[key] = `${key} must be a whole number from ${rule.min} to ${rule.max}.`;
            }
        } else if (typeof raw === "boolean") {
            value[key] = raw;
        } else {
            errors[key] = `${key} must be true or false.`;
        }
    }

    if (Object.keys(errors).length > 0) {
        return { ok: false, errors };
    }

    if (mode === "update" && Object.keys(value).length === 0) {
        return { ok: false, errors: { body: "Send at least one field to update." } };
    }

    return { ok: true, value };
};

export const FAQ_RULES: Record<string, Rule> = {
    question: { type: "string", min: 3, max: 200, required: true },
    answer: { type: "string", min: 3, max: 1000, required: true },
    sortOrder: { type: "int", min: 0, max: 10000 },
    isActive: { type: "boolean" },
};

export const TESTIMONIAL_RULES: Record<string, Rule> = {
    name: { type: "string", min: 2, max: 80, required: true },
    area: { type: "string", min: 2, max: 80, required: true },
    rating: { type: "int", min: 1, max: 5, required: true },
    quote: { type: "string", min: 5, max: 500, required: true },
    sortOrder: { type: "int", min: 0, max: 10000 },
    isActive: { type: "boolean" },
};