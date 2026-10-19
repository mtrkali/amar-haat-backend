// Server-side checkout rules. They mirror src/lib/checkout.ts in the frontend,
// but the server never trusts the browser, so everything is checked again here.

export const UPAZILAS: readonly string[] = [
    "ফেনী সদর",
    "ছাগলনাইয়া",
    "দাগনভূঞা",
    "ফুলগাজী",
    "পরশুরাম",
    "সোনাগাজী",
];

export const MAX_QUANTITY = 20; // same limit as the frontend cart
export const MAX_DISTINCT_ITEMS = 50;

export type OrderItemInput = {
    productSlug: string;
    quantity: number;
};

export type ValidatedOrder = {
    customerName: string;
    customerPhone: string;
    upazila: string;
    union: string;
    ward: number | null;
    address: string;
    note: string | null;
    items: OrderItemInput[];
};

export type OrderValidationResult =
    | { ok: true; value: ValidatedOrder }
    | { ok: false; errors: Record<string, string> };

const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯";

const toEnglishDigits = (input: string): string =>
    input.replace(/[০-৯]/g, (digit) => String(BENGALI_DIGITS.indexOf(digit)));

const normalizePhone = (input: string): string => {
    let phone = toEnglishDigits(input).replace(/[\s\-()]/g, "");

    if (phone.startsWith("+880")) {
        phone = "0" + phone.slice(4);
    } else if (phone.startsWith("880") && phone.length === 13) {
        phone = "0" + phone.slice(3);
    }

    return phone;
};

const PHONE_PATTERN = /^01[3-9]\d{8}$/;

const text = (value: unknown): string =>
    typeof value === "string" ? value : "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

// Expected body:
// {
//   "customer": { "name", "phone", "upazila", "union", "ward"?, "address", "note"? },
//   "items": [ { "productSlug": "tomato", "quantity": 2 } ]
// }
// Prices are NOT accepted from the client on purpose.
export const validateOrderBody = (body: unknown): OrderValidationResult => {
    const errors: Record<string, string> = {};

    const customer = isRecord(body) ? body["customer"] : undefined;

    if (!isRecord(body) || !isRecord(customer)) {
        return { ok: false, errors: { customer: "Customer details are required." } };
    }

    const name = text(customer["name"]).trim().replace(/\s+/g, " ");
    const phone = normalizePhone(text(customer["phone"]));
    const upazila = text(customer["upazila"]);
    const union = text(customer["union"]).trim().replace(/\s+/g, " ");
    const wardText = toEnglishDigits(text(customer["ward"]).trim());
    const address = text(customer["address"]).trim();
    const note = text(customer["note"]).trim();

    if (name.length < 2 || name.length > 80) {
        errors["name"] = "Name must be 2 to 80 characters.";
    }

    if (!PHONE_PATTERN.test(phone)) {
        errors["phone"] = "Enter a valid mobile number like 01XXXXXXXXX.";
    }

    if (!UPAZILAS.includes(upazila)) {
        errors["upazila"] = "Choose a valid upazila.";
    }

    if (union.length < 2 || union.length > 50) {
        errors["union"] = "Union must be 2 to 50 characters.";
    }

    let ward: number | null = null;

    if (wardText) {
        ward = /^\d{1,2}$/.test(wardText) ? Number(wardText) : NaN;

        if (!Number.isInteger(ward) || ward < 1 || ward > 99) {
            errors["ward"] = "Ward must be a number from 1 to 99.";
        }
    }

    if (address.length < 10 || address.length > 300) {
        errors["address"] = "Address must be 10 to 300 characters.";
    }

    if (note.length > 300) {
        errors["note"] = "Note must be 300 characters or fewer.";
    }

    // Items: merge duplicate products into one line.
    const rawItems = body["items"];
    const merged = new Map<string, number>();

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        errors["items"] = "The order must contain at least one item.";
    } else {
        for (const raw of rawItems) {
            const slug = isRecord(raw) ? text(raw["productSlug"]).trim() : "";
            const quantity = isRecord(raw) ? raw["quantity"] : undefined;

            if (
                !slug ||
                typeof quantity !== "number" ||
                !Number.isInteger(quantity) ||
                quantity < 1
            ) {
                errors["items"] = "Each item needs a productSlug and a whole-number quantity of 1 or more.";
                break;
            }

            merged.set(slug, (merged.get(slug) ?? 0) + quantity);
        }

        if (!errors["items"] && merged.size > MAX_DISTINCT_ITEMS) {
            errors["items"] = `An order can have at most ${MAX_DISTINCT_ITEMS} different products.`;
        }

        if (!errors["items"]) {
            for (const quantity of merged.values()) {
                if (quantity > MAX_QUANTITY) {
                    errors["items"] = `You can order at most ${MAX_QUANTITY} of one product.`;
                    break;
                }
            }
        }
    }

    if (Object.keys(errors).length > 0) {
        return { ok: false, errors };
    }

    return {
        ok: true,
        value: {
            customerName: name,
            customerPhone: phone,
            upazila,
            union,
            ward,
            address,
            note: note || null,
            items: [...merged.entries()].map(([productSlug, quantity]) => ({
                productSlug,
                quantity,
            })),
        },
    };
};

export { normalizePhone };