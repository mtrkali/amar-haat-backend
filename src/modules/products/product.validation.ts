// Checks the body of "create product" and "update product" requests.

export type ProductInput = {
    slug?: string | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    categorySlug?: string | undefined;
    price?: number | undefined;
    oldPrice?: number | null | undefined;
    stock?: number | undefined;
    imageUrl?: string | null | undefined;
    isActive?: boolean | undefined;
    sellerId?: number | null | undefined; // only an ADMIN may set this, and only when creating
};

export type ProductValidationResult =
    | { ok: true; value: ProductInput }
    | { ok: false; errors: Record<string, string> };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = ["manage"]; // would clash with the /products/manage route

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export const validateProductBody = (
    body: unknown,
    mode: "create" | "update"
): ProductValidationResult => {
    if (!isRecord(body)) {
        return { ok: false, errors: { body: "Request body is required." } };
    }

    const data: Record<string, unknown> = body;
    const errors: Record<string, string> = {};
    const value: ProductInput = {};
    const has = (key: string) => data[key] !== undefined;
    const need = (key: string) => mode === "create" && !has(key);

    // slug: set once at creation, never changed (links and old orders depend on it)
    if (mode === "update" && has("slug")) {
        errors["slug"] = "Slug cannot be changed.";
    } else if (has("slug")) {
        const slug = data["slug"];

        if (typeof slug !== "string" || !SLUG_PATTERN.test(slug) || slug.length > 60 || RESERVED_SLUGS.includes(slug)) {
            errors["slug"] = "Slug must be lowercase English letters, digits and dashes (for example: red-tomato).";
        } else {
            value.slug = slug;
        }
    } else if (need("slug")) {
        errors["slug"] = "Slug is required.";
    }

    if (has("name")) {
        const name = typeof data["name"] === "string" ? data["name"].trim().replace(/\s+/g, " ") : "";

        if (name.length < 2 || name.length > 120) {
            errors["name"] = "Name must be 2 to 120 characters.";
        } else {
            value.name = name;
        }
    } else if (need("name")) {
        errors["name"] = "Name is required.";
    }

    if (has("description")) {
        const d = data["description"];

        if (d === null || d === "") {
            value.description = null;
        } else if (typeof d === "string" && d.trim().length <= 1000) {
            value.description = d.trim();
        } else {
            errors["description"] = "Description must be 1000 characters or fewer.";
        }
    }

    if (has("categorySlug")) {
        const c = data["categorySlug"];

        if (typeof c === "string" && c.trim()) {
            value.categorySlug = c.trim();
        } else {
            errors["categorySlug"] = "Category is invalid.";
        }
    } else if (need("categorySlug")) {
        errors["categorySlug"] = "Category is required.";
    }

    if (has("price")) {
        const p = data["price"];

        if (typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 10_000_000) {
            value.price = p;
        } else {
            errors["price"] = "Price must be a whole number of taka, 1 or more.";
        }
    } else if (need("price")) {
        errors["price"] = "Price is required.";
    }

    if (has("oldPrice")) {
        const p = data["oldPrice"];

        if (p === null) {
            value.oldPrice = null;
        } else if (typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 10_000_000) {
            value.oldPrice = p;
        } else {
            errors["oldPrice"] = "Old price must be a whole number of taka, or null to remove it.";
        }
    }

    if (has("stock")) {
        const s = data["stock"];

        if (typeof s === "number" && Number.isInteger(s) && s >= 0 && s <= 1_000_000) {
            value.stock = s;
        } else {
            errors["stock"] = "Stock must be a whole number, 0 or more.";
        }
    } else if (need("stock")) {
        errors["stock"] = "Stock is required.";
    }

    if (has("imageUrl")) {
        const u = data["imageUrl"];

        if (u === null || u === "") {
            value.imageUrl = null;
        } else if (typeof u === "string" && u.length <= 500 && (u.startsWith("/") || /^https?:\/\//.test(u))) {
            value.imageUrl = u;
        } else {
            errors["imageUrl"] = "Image must be a link starting with / or http(s)://.";
        }
    }

    if (has("isActive")) {
        if (typeof data["isActive"] === "boolean") {
            value.isActive = data["isActive"];
        } else {
            errors["isActive"] = "isActive must be true or false.";
        }
    }

    if (mode === "create" && has("sellerId")) {
        const s = data["sellerId"];

        if (s === null || (typeof s === "number" && Number.isInteger(s) && s >= 1)) {
            value.sellerId = s;
        } else {
            errors["sellerId"] = "sellerId must be a positive whole number or null.";
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