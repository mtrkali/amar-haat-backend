// Business decisions that are NOT final yet (see SRS section 15).
// Everything here can be changed from environment variables, without touching code.
// A missing or invalid value falls back to the safe default shown next to each setting.

const wholeNumber = (name: string, fallback: number): number => {
    const raw = process.env[name];

    if (raw === undefined || raw.trim() === "") return fallback;

    const value = Number(raw);

    return Number.isInteger(value) && value >= 0 ? value : fallback;
};

const oneOf = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
    const raw = process.env[name]?.trim().toUpperCase();

    return allowed.find((option) => option === raw) ?? fallback;
};

const listOf = <T extends string>(name: string, allowed: readonly T[], fallback: readonly T[]): T[] => {
    const raw = process.env[name];

    if (raw === undefined || raw.trim() === "") return [...fallback];

    const picked = raw
        .split(",")
        .map((part) => part.trim().toUpperCase())
        .filter((part): part is T => (allowed as readonly string[]).includes(part));

    return picked.length > 0 ? picked : [...fallback];
};

export const DELIVERY_METHODS = ["PLATFORM_RIDER", "SELLER", "PICKUP"] as const;
export type DeliveryMethodName = (typeof DELIVERY_METHODS)[number];

const flatDeliveryFee = wholeNumber("DELIVERY_FEE", 0);

export const businessConfig = {
    // Flat delivery fee in taka (SRS item 6, undecided). Default: 0.
    deliveryFee: flatDeliveryFee,

    // Fee per delivery method. Rider and seller delivery default to the flat fee, pickup to 0.
    deliveryFeeByMethod: {
        PLATFORM_RIDER: wholeNumber("DELIVERY_FEE_PLATFORM_RIDER", flatDeliveryFee),
        SELLER: wholeNumber("DELIVERY_FEE_SELLER", flatDeliveryFee),
        PICKUP: wholeNumber("DELIVERY_FEE_PICKUP", 0),
    } satisfies Record<DeliveryMethodName, number>,

    // Which delivery methods customers may choose, e.g. DELIVERY_METHODS=SELLER,PICKUP.
    // Default: all three.
    enabledDeliveryMethods: listOf("DELIVERY_METHODS", DELIVERY_METHODS, DELIVERY_METHODS),

    commission: {
        // Default marketplace commission in basis points (100 = 1%). SRS item 8, undecided.
        // A seller's own commissionBps overrides it. Default: 0 (no commission).
        rateBps: Math.min(wholeNumber("COMMISSION_RATE_BPS", 0), 10000),

        // What the rate is applied to. Default: SUBTOTAL (products only, delivery excluded).
        basis: oneOf("COMMISSION_BASIS", ["SUBTOTAL", "SUBTOTAL_PLUS_DELIVERY"] as const, "SUBTOTAL"),
    },

    // How a guest looks up an order (SRS item 11, undecided).
    //   PHONE          order number + phone (today's behaviour)
    //   TOKEN          a secret link given at checkout
    //   TOKEN_OR_PHONE either one works
    // Default: PHONE, so nothing changes until step 3 is live.
    guestTrackingMethod: oneOf("GUEST_TRACKING_METHOD", ["PHONE", "TOKEN", "TOKEN_OR_PHONE"] as const, "PHONE"),

    // SRS item 5: must an admin approve a seller's new product before it goes live? Default: false.
    productApprovalRequired: process.env["PRODUCT_APPROVAL_REQUIRED"] === "true",

    // When "true", POST /orders is rejected without an Idempotency-Key header.
    // Turn it on once the new frontend is live. Default: false.
    idempotencyRequired: process.env["IDEMPOTENCY_REQUIRED"] === "true",
};